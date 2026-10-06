import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'

const port = 8799
const base = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['bridge/dev-server.mjs'], {
  env: { ...process.env, PHIFORM_BRIDGE_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stderr = ''
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
})

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${base}/v1/health`)
      if (response.ok) return response.json()
    } catch {
      // Bridge may still be binding its socket.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`bridge never became healthy: ${stderr}`)
}

try {
  const health = await waitForHealth()
  assert.equal(health.schema, 'phiform.bridge.health.v1')
  assert.equal(health.status, 'ok')

  const backendResponse = await fetch(`${base}/v1/backends`)
  assert.equal(backendResponse.status, 200)
  const { backends } = await backendResponse.json()
  const backend = backends.find((item) => item.id === 'dev.glb-proof.v1')
  assert.ok(backend)
  assert.equal(backend.kind, 'proof')
  assert.equal(backend.capabilities.glbOutput, true)
  assert.equal(backend.capabilities.imageTo3D, false)

  const submitResponse = await fetch(`${base}/v1/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      backendId: backend.id,
      prompt: 'contract qualification cube',
    }),
  })
  assert.equal(submitResponse.status, 202)
  let job = await submitResponse.json()
  assert.equal(job.schema, 'phiform.bridge.job.v1')

  for (let attempt = 0; attempt < 60 && job.status !== 'succeeded'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    const response = await fetch(`${base}/v1/jobs/${job.id}`)
    assert.equal(response.status, 200)
    job = await response.json()
  }

  assert.equal(job.status, 'succeeded')
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

  process.stdout.write(
    `PASS bridge contract: ${job.id} ${sha256.slice(0, 12)}… ${glb.length} bytes\n`,
  )
} finally {
  child.kill('SIGTERM')
}
