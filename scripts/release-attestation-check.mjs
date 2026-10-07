import assert from 'node:assert/strict'
import {
  createHash,
  generateKeyPairSync,
} from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { verifyReleaseAttestation } from '../bridge/signing/release.mjs'

const workDir = await mkdtemp(join(tmpdir(), 'phiform-attestation-'))
const keyPath = join(workDir, 'release.private.pem')
const token = 'phiform-ci-release-token'
const port = 8803
const base = `http://127.0.0.1:${port}`

const { privateKey } = generateKeyPairSync('ed25519')
await writeFile(
  keyPath,
  privateKey.export({ type: 'pkcs8', format: 'pem' }),
)

const child = spawn(process.execPath, ['bridge/dev-server.mjs'], {
  cwd: resolve('.'),
  env: {
    ...process.env,
    PHIFORM_BRIDGE_PORT: String(port),
    PHIFORM_RELEASE_SIGNING_KEY: keyPath,
    PHIFORM_RELEASE_SIGNING_TOKEN: token,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})

async function waitForHealth() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${base}/v1/health`)
      if (response.ok) return response.json()
    } catch {}
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, 50),
    )
  }
  throw new Error(`bridge never became healthy: ${stderr}`)
}

const packageBytes = Buffer.from(
  'PhiForm deterministic release package fixture',
)
const packageSha256 = createHash('sha256')
  .update(packageBytes)
  .digest('hex')

const releaseReceipt = {
  schema: 'phiform.release-receipt.v1',
  id: 'release-receipt-ci',
  createdAt: '2026-10-06T00:00:00.000Z',
  releaseId: 'release-ci',
  sourceArtifactId: 'artifact-ci',
  sourceNodeId: 'node-ci',
  target: 'basisu-compact',
  targetReceiptId: 'compact-ci',
  validationReceiptId: 'validation-ci',
  policyId: 'strict-pass',
  packageFilename: 'asset-release.zip',
  packageByteLength: packageBytes.length,
  packageSha256,
  manifest: {},
  files: [],
  decision: 'released',
}

try {
  const health = await waitForHealth()
  assert.equal(health.bridgeVersion, '0.6.0')

  const descriptorResponse = await fetch(
    `${base}/v1/release-signer`,
  )
  assert.equal(descriptorResponse.status, 200)
  const descriptor = await descriptorResponse.json()
  assert.equal(descriptor.schema, 'phiform.release-signer.v1')
  assert.equal(descriptor.available, true)
  assert.equal(descriptor.algorithm, 'Ed25519')
  assert.match(
    descriptor.publicKeyFingerprintSha256,
    /^[0-9a-f]{64}$/,
  )

  const unauthorized = await fetch(
    `${base}/v1/release-attest`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        packageBase64: packageBytes.toString('base64'),
        releaseReceipt,
      }),
    },
  )
  assert.equal(unauthorized.status, 401)

  const wrongToken = await fetch(
    `${base}/v1/release-attest`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify({
        packageBase64: packageBytes.toString('base64'),
        releaseReceipt,
      }),
    },
  )
  assert.equal(wrongToken.status, 401)

  const signedResponse = await fetch(
    `${base}/v1/release-attest`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        packageBase64: packageBytes.toString('base64'),
        releaseReceipt,
      }),
    },
  )
  assert.equal(signedResponse.status, 200)
  const attestation = await signedResponse.json()

  assert.equal(attestation.schema, 'phiform.release-attestation.v1')
  assert.equal(attestation.algorithm, 'Ed25519')
  assert.equal(attestation.signatureVerified, true)
  assert.equal(
    attestation.publicKeyFingerprintSha256,
    descriptor.publicKeyFingerprintSha256,
  )
  assert.equal(attestation.statement.releaseId, releaseReceipt.releaseId)
  assert.equal(
    attestation.statement.releaseReceiptId,
    releaseReceipt.id,
  )
  assert.equal(
    attestation.statement.packageSha256,
    packageSha256,
  )
  assert.equal(
    attestation.statement.packageByteLength,
    packageBytes.length,
  )
  assert.equal(verifyReleaseAttestation(attestation), true)

  const signedAgain = await fetch(
    `${base}/v1/release-attest`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        packageBase64: packageBytes.toString('base64'),
        releaseReceipt,
      }),
    },
  )
  const secondAttestation = await signedAgain.json()
  assert.equal(
    secondAttestation.signatureBase64,
    attestation.signatureBase64,
  )
  assert.equal(
    secondAttestation.signedPayloadSha256,
    attestation.signedPayloadSha256,
  )

  const forgedBytes = Buffer.concat([
    packageBytes,
    Buffer.from('tampered'),
  ])
  const forgedResponse = await fetch(
    `${base}/v1/release-attest`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        packageBase64: forgedBytes.toString('base64'),
        releaseReceipt,
      }),
    },
  )
  assert.equal(forgedResponse.status, 500)
  assert.match(
    await forgedResponse.text(),
    /release ZIP bytes do not match/,
  )

  const tampered = {
    ...attestation,
    signatureBase64:
      attestation.signatureBase64.slice(0, -4) + 'AAAA',
  }
  assert.equal(verifyReleaseAttestation(tampered), false)

  const misleadingStatement = {
    ...attestation,
    statement: {
      ...attestation.statement,
      packageSha256: '0'.repeat(64),
    },
  }
  assert.equal(
    verifyReleaseAttestation(misleadingStatement),
    false,
  )

  process.stdout.write(
    [
      'PASS release signer discovery',
      'PASS missing token rejected with 401',
      'PASS wrong token rejected with 401',
      'PASS package hash recomputed before signing',
      'PASS Ed25519 detached signature',
      'PASS signer public-key fingerprint',
      'PASS local signature verification',
      'PASS deterministic signature for identical statement',
      'PASS forged package bytes rejected',
      'PASS tampered signature rejected',
      'PASS readable statement tampering rejected',
    ].join('\n') + '\n',
  )
} finally {
  child.kill('SIGTERM')
  await rm(workDir, { recursive: true, force: true })
}
