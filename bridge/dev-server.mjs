import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { proofBackend } from './backends/proof.mjs'
import { createSf3dBackend } from './backends/sf3d.mjs'

const host = process.env.PHIFORM_BRIDGE_HOST || '127.0.0.1'
const port = Number(process.env.PHIFORM_BRIDGE_PORT || 8787)
const jobs = new Map()

const implementations = [
  proofBackend,
  createSf3dBackend(process.env),
]

function cors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
}

function json(res, status, value) {
  cors(res)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

async function readJson(req, limit = 16 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('request body exceeds 16 MiB')
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  return text ? JSON.parse(text) : {}
}

function publicJob(job) {
  return {
    schema: 'phiform.bridge.job.v1',
    id: job.id,
    backendId: job.backendId,
    status: job.status,
    seed: job.seed,
    seedKind: job.seedKind,
    createdAt: job.createdAt,
    ...(job.status === 'succeeded'
      ? {
          artifact: {
            url: `/artifacts/${job.id}.glb`,
            format: 'glb',
            mimeType: 'model/gltf-binary',
            sha256: job.sha256,
            byteLength: job.buffer.length,
          },
          notes: job.notes,
        }
      : {}),
    ...(job.status === 'failed' ? { error: job.error } : {}),
  }
}

function backendById(id) {
  return implementations.find((item) => item.descriptor.id === id)
}

async function executeJob(job, implementation, body) {
  job.status = 'running'
  try {
    const result = await implementation.run(body, { jobId: job.id })
    job.buffer = result.buffer
    job.seed = result.seed
    job.seedKind = result.seedKind || 'request-fingerprint'
    job.sha256 = createHash('sha256').update(result.buffer).digest('hex')
    job.notes = [
      ...(result.notes || []),
      'Artifact hash is SHA-256 over the exact served GLB bytes.',
    ]
    job.status = 'succeeded'
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : 'backend execution failed'
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`)

    if (req.method === 'OPTIONS') {
      cors(res)
      res.writeHead(204)
      res.end()
      return
    }

    if (req.method === 'GET' && url.pathname === '/v1/health') {
      json(res, 200, {
        schema: 'phiform.bridge.health.v1',
        status: 'ok',
        bridgeVersion: '0.3.0',
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/v1/backends') {
      json(res, 200, { backends: implementations.map((item) => item.descriptor) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/v1/jobs') {
      const body = await readJson(req)
      const implementation = backendById(body.backendId)

      if (!implementation) {
        json(res, 400, { error: 'unknown backend' })
        return
      }

      if (!implementation.descriptor.available) {
        json(res, 400, {
          error: implementation.descriptor.statusReason || 'backend unavailable',
        })
        return
      }

      const validationError = implementation.validate(body)
      if (validationError) {
        json(res, 400, { error: validationError })
        return
      }

      const id = randomUUID()
      const job = {
        id,
        backendId: implementation.descriptor.id,
        status: 'queued',
        seed: 0,
        seedKind: 'request-fingerprint',
        createdAt: new Date().toISOString(),
        buffer: Buffer.alloc(0),
        sha256: '',
        notes: [],
      }

      jobs.set(id, job)
      setImmediate(() => {
        executeJob(job, implementation, body)
      })

      json(res, 202, publicJob(job))
      return
    }

    const jobMatch = url.pathname.match(/^\/v1\/jobs\/([0-9a-f-]+)$/)
    if (req.method === 'GET' && jobMatch) {
      const job = jobs.get(jobMatch[1])
      if (!job) {
        json(res, 404, { error: 'job not found' })
        return
      }
      json(res, 200, publicJob(job))
      return
    }

    const artifactMatch = url.pathname.match(/^\/artifacts\/([0-9a-f-]+)\.glb$/)
    if (req.method === 'GET' && artifactMatch) {
      const job = jobs.get(artifactMatch[1])
      if (!job || job.status !== 'succeeded') {
        json(res, 404, { error: 'artifact not found' })
        return
      }

      cors(res)
      res.writeHead(200, {
        'content-type': 'model/gltf-binary',
        'content-length': String(job.buffer.length),
        etag: `"${job.sha256}"`,
      })
      res.end(job.buffer)
      return
    }

    json(res, 404, { error: 'not found' })
  } catch (error) {
    json(res, 500, {
      error: error instanceof Error ? error.message : 'internal bridge error',
    })
  }
})

server.listen(port, host, () => {
  const available = implementations.filter((item) => item.descriptor.available)
  process.stdout.write(
    `PhiForm local bridge v0.3.0 listening on http://${host}:${port} · ${available.length}/${implementations.length} backends available\n`,
  )
})
