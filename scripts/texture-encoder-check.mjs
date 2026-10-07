import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..')
const fixture = join(here, 'fixtures', 'fake-ktx-cli.mjs')
const port = 8801
const endpoint = `http://127.0.0.1:${port}`

const bridge = spawn(
  process.execPath,
  [join(repo, 'bridge', 'dev-server.mjs')],
  {
    cwd: repo,
    env: {
      ...process.env,
      PHIFORM_BRIDGE_PORT: String(port),
      PHIFORM_KTX_BIN: process.execPath,
      PHIFORM_KTX_PREFIX_ARGS_JSON: JSON.stringify([fixture]),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let stderr = ''
bridge.stderr.on('data', (chunk) => {
  stderr += String(chunk)
})

async function waitForHealth() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${endpoint}/v1/health`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`bridge did not start: ${stderr}`)
}

async function waitForTextureJob(id) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const response = await fetch(`${endpoint}/v1/texture-jobs/${id}`)
    assert.equal(response.ok, true)
    const job = await response.json()
    if (job.status === 'succeeded') return job
    if (job.status === 'failed') {
      throw new Error(job.error || 'texture job failed')
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('texture job timed out')
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lm1Z4wAAAABJRU5ErkJggg==',
  'base64',
)

try {
  await waitForHealth()

  const descriptorResponse = await fetch(`${endpoint}/v1/texture-encoder`)
  assert.equal(descriptorResponse.ok, true)
  const descriptor = await descriptorResponse.json()
  assert.equal(descriptor.schema, 'phiform.texture-encoder.v1')
  assert.equal(descriptor.id, 'khronos.ktx.v1')
  assert.equal(descriptor.available, true)
  assert.match(descriptor.version, /v5\.0\.0-phiform-fixture/)
  assert.deepEqual(descriptor.codecs, ['basis-lz', 'uastc-ldr-4x4'])

  const submit = async (codec, colorSpace) => {
    const response = await fetch(`${endpoint}/v1/texture-jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        textureId: `texture-${codec}`,
        codec,
        colorSpace,
        sourceSha256: sha256(png),
        sourcePngBase64: png.toString('base64'),
      }),
    })
    assert.equal(response.status, 202)
    const queued = await response.json()
    return waitForTextureJob(queued.id)
  }

  const basis = await submit('basis-lz', 'srgb')
  assert.equal(basis.sourceSha256, sha256(png))
  assert.equal(basis.sourceByteLength, png.length)
  assert.equal(basis.encoder.id, 'khronos.ktx.v1')
  assert.match(basis.encoder.version, /v5\.0\.0-phiform-fixture/)

  const basisArtifactResponse = await fetch(
    new URL(basis.artifact.url, `${endpoint}/`),
  )
  assert.equal(basisArtifactResponse.ok, true)
  const basisBytes = Buffer.from(await basisArtifactResponse.arrayBuffer())
  assert.equal(basis.artifact.byteLength, basisBytes.length)
  assert.equal(basis.artifact.sha256, sha256(basisBytes))
  assert.deepEqual(
    [...basisBytes.subarray(0, 12)],
    [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a],
  )
  const basisEvidence = JSON.parse(basisBytes.subarray(12).toString('utf8'))
  assert.ok(basisEvidence.args.includes('basis-lz'))
  assert.ok(basisEvidence.args.includes('R8G8B8A8_SRGB'))
  assert.ok(basisEvidence.args.includes('--generate-mipmap'))
  assert.ok(basisEvidence.args.includes('--assign-tf'))
  assert.ok(basisEvidence.args.includes('srgb'))

  const uastc = await submit('uastc-ldr-4x4', 'linear')
  const uastcBytes = Buffer.from(
    await (
      await fetch(new URL(uastc.artifact.url, `${endpoint}/`))
    ).arrayBuffer(),
  )
  const uastcEvidence = JSON.parse(uastcBytes.subarray(12).toString('utf8'))
  assert.ok(uastcEvidence.args.includes('uastc-ldr-4x4'))
  assert.ok(uastcEvidence.args.includes('R8G8B8A8_UNORM'))
  assert.ok(uastcEvidence.args.includes('--uastc-rdo'))
  assert.ok(uastcEvidence.args.includes('--zstd'))
  assert.ok(uastcEvidence.args.includes('linear'))

  const badHash = await fetch(`${endpoint}/v1/texture-jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      textureId: 'bad-hash',
      codec: 'basis-lz',
      colorSpace: 'srgb',
      sourceSha256: '0'.repeat(64),
      sourcePngBase64: png.toString('base64'),
    }),
  })
  assert.equal(badHash.status, 400)
  assert.match(await badHash.text(), /source SHA-256 does not match/)

  process.stdout.write(
    [
      'PASS KTX encoder probe + version',
      'PASS ETC1S/BasisLZ create arguments',
      'PASS UASTC + RDO + Zstd create arguments',
      'PASS generated mipmap request',
      'PASS sRGB / linear format selection',
      'PASS async texture job lifecycle',
      'PASS KTX2 signature + SHA-256 artifact binding',
      'PASS source hash mismatch rejection',
    ].join('\n') + '\n',
  )
} finally {
  bridge.kill('SIGTERM')
}
