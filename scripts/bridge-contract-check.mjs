import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'

const port = 8799
const base = `http://127.0.0.1:${port}`
const fixtureDir = resolve('test-fixtures/sf3d')
const fixtureRunner = resolve('test-fixtures/sf3d/run.mjs')

const child = spawn(process.execPath, ['bridge/dev-server.mjs'], {
  env: {
    ...process.env,
    PHIFORM_BRIDGE_PORT: String(port),
    PHIFORM_SF3D_DIR: fixtureDir,
    PHIFORM_SF3D_RUN_SCRIPT: fixtureRunner,
    PHIFORM_SF3D_PYTHON: process.execPath,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${base}/v1/health`)
      if (response.ok) return response.json()
    } catch {
      // Bridge may still be binding its socket.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  throw new Error(`bridge never became healthy: ${stderr}`)
}

async function waitForJob(id) {
  let job
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await fetch(`${base}/v1/jobs/${id}`)
    assert.equal(response.status, 200)
    job = await response.json()
    if (job.status === 'succeeded' || job.status === 'failed') return job
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 50))
  }
  throw new Error(`job ${id} did not finish`)
}

async function validateArtifact(job) {
  assert.equal(job.status, 'succeeded', job.error)
  assert.equal(job.artifact.format, 'glb')
  assert.match(job.artifact.sha256, /^[0-9a-f]{64}$/)

  const artifactResponse = await fetch(new URL(job.artifact.url, base))
  assert.equal(artifactResponse.status, 200)
  const glb = Buffer.from(await artifactResponse.arrayBuffer())
  assert.equal(glb.subarray(0, 4).toString('ascii'), 'glTF')
  assert.equal(glb.readUInt32LE(4), 2)
  assert.equal(glb.readUInt32LE(8), glb.length)

  const sha256 = createHash('sha256').update(glb).digest('hex')
  assert.equal(sha256, job.artifact.sha256)
  assert.equal(glb.length, job.artifact.byteLength)
  return { glb, sha256 }
}

try {
  const health = await waitForHealth()
  assert.equal(health.schema, 'phiform.bridge.health.v1')
  assert.equal(health.status, 'ok')
  assert.equal(health.bridgeVersion, '0.3.0')

  const backendResponse = await fetch(`${base}/v1/backends`)
  assert.equal(backendResponse.status, 200)
  const { backends } = await backendResponse.json()

  const proof = backends.find((item) => item.id === 'dev.glb-proof.v1')
  assert.ok(proof)
  assert.equal(proof.kind, 'proof')
  assert.equal(proof.capabilities.imageTo3D, false)

  const sf3d = backends.find((item) => item.id === 'stability.sf3d.v1')
  assert.ok(sf3d)
  assert.equal(sf3d.kind, 'neural')
  assert.equal(sf3d.available, true)
  assert.equal(sf3d.capabilities.imageTo3D, true)
  assert.equal(sf3d.capabilities.textTo3D, false)
  assert.match(sf3d.license, /Stability AI Community License/)

  const proofSubmit = await fetch(`${base}/v1/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      backendId: proof.id,
      prompt: 'contract qualification cube',
    }),
  })
  assert.equal(proofSubmit.status, 202)
  const proofAccepted = await proofSubmit.json()
  const proofJob = await waitForJob(proofAccepted.id)
  const proofArtifact = await validateArtifact(proofJob)

  const missingImage = await fetch(`${base}/v1/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      backendId: sf3d.id,
      prompt: 'this prompt alone must not masquerade as SF3D input',
    }),
  })
  assert.equal(missingImage.status, 400)

  const fakeImage = Buffer.from('PhiForm SF3D CLI contract fixture')
  const neuralSubmit = await fetch(`${base}/v1/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      backendId: sf3d.id,
      prompt: 'metadata-only prompt',
      image: {
        name: 'fixture.png',
        type: 'image/png',
        size: fakeImage.length,
        dataBase64: fakeImage.toString('base64'),
      },
    }),
  })
  assert.equal(neuralSubmit.status, 202)
  const neuralAccepted = await neuralSubmit.json()
  const neuralJob = await waitForJob(neuralAccepted.id)
  const neuralArtifact = await validateArtifact(neuralJob)
  assert.equal(neuralJob.seedKind, 'request-fingerprint')
  assert.ok(
    neuralJob.notes.some((note) => note.includes('operator-installed Stable Fast 3D')),
  )

  process.stdout.write(
    [
      `PASS proof bridge: ${proofJob.id} ${proofArtifact.sha256.slice(0, 12)}…`,
      `PASS SF3D adapter contract: ${neuralJob.id} ${neuralArtifact.sha256.slice(0, 12)}…`,
      'NOTE CI uses a CLI fixture; it does not claim neural inference.',
    ].join('\n') + '\n',
  )
} finally {
  child.kill('SIGTERM')
}
