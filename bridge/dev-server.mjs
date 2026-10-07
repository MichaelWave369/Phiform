import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { proofBackend } from './backends/proof.mjs'
import { createSf3dBackend } from './backends/sf3d.mjs'
import { createKtxEncoder, KTX_CODECS } from './texture/ktx.mjs'
import { validateGlbBytes } from './validation/gltf.mjs'
import { createReleaseSigner } from './signing/release.mjs'

const host = process.env.PHIFORM_BRIDGE_HOST || '127.0.0.1'
const port = Number(process.env.PHIFORM_BRIDGE_PORT || 8787)
const jobs = new Map()
const textureJobs = new Map()
const textureEncoder = createKtxEncoder()
const releaseSigner = createReleaseSigner(process.env)

const implementations = [
  proofBackend,
  createSf3dBackend(process.env),
]

function cors(res) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type, authorization')
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

function publicTextureJob(job) {
  return {
    schema: 'phiform.texture-encode-job.v1',
    id: job.id,
    textureId: job.textureId,
    codec: job.codec,
    colorSpace: job.colorSpace,
    status: job.status,
    createdAt: job.createdAt,
    sourceSha256: job.sourceSha256,
    sourceByteLength: job.sourceByteLength,
    ...(job.status === 'succeeded'
      ? {
          artifact: {
            url: `/texture-artifacts/${job.id}.ktx2`,
            format: 'ktx2',
            mimeType: 'image/ktx2',
            sha256: job.sha256,
            byteLength: job.buffer.length,
          },
          encoder: {
            id: textureEncoder.id,
            version: job.encoderVersion,
          },
          notes: job.notes,
        }
      : {}),
    ...(job.status === 'failed' ? { error: job.error } : {}),
  }
}

async function executeTextureJob(job, source) {
  job.status = 'running'
  try {
    const result = await textureEncoder.encode(
      source,
      job.codec,
      job.colorSpace,
    )
    job.buffer = result.buffer
    job.sha256 = createHash('sha256').update(result.buffer).digest('hex')
    job.encoderVersion = result.version
    job.notes = [
      ...(result.notes || []),
      'Artifact hash is SHA-256 over the exact served KTX2 bytes.',
    ]
    job.status = 'succeeded'
  } catch (error) {
    job.status = 'failed'
    job.error = error instanceof Error ? error.message : 'texture encoding failed'
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
        bridgeVersion: '0.6.0',
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/v1/backends') {
      json(res, 200, { backends: implementations.map((item) => item.descriptor) })
      return
    }
    if (req.method === 'GET' && url.pathname === '/v1/texture-encoder') {
      json(res, 200, textureEncoder.probe())
      return
    }
    if (req.method === 'GET' && url.pathname === '/v1/release-signer') {
      json(res, 200, await releaseSigner.descriptor())
      return
    }

    if (req.method === 'POST' && url.pathname === '/v1/release-attest') {
      const authorization = req.headers.authorization || ''
      const token = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : ''

      if (!releaseSigner.authorized(token)) {
        json(res, 401, { error: 'release signing authorization failed' })
        return
      }

      const body = await readJson(req, 256 * 1024 * 1024)
      if (
        typeof body.packageBase64 !== 'string' ||
        !body.packageBase64 ||
        !body.releaseReceipt
      ) {
        json(res, 400, {
          error: 'packageBase64 and releaseReceipt are required',
        })
        return
      }

      const packageBytes = Buffer.from(body.packageBase64, 'base64')
      const attestation = await releaseSigner.attest(
        body.releaseReceipt,
        packageBytes,
        token,
      )

      json(res, 200, attestation)
      return
    }

    if (req.method === 'POST' && url.pathname === '/v1/gltf-validate') {
      const body = await readJson(req, 192 * 1024 * 1024)
      if (
        typeof body.glbBase64 !== 'string' ||
        !body.glbBase64
      ) {
        json(res, 400, { error: 'glbBase64 is required' })
        return
      }

      const bytes = Buffer.from(body.glbBase64, 'base64')
      const sha256 = createHash('sha256').update(bytes).digest('hex')

      if (
        typeof body.sha256 === 'string' &&
        body.sha256 &&
        body.sha256 !== sha256
      ) {
        json(res, 400, {
          error: 'GLB SHA-256 does not match submitted bytes',
        })
        return
      }

      const report = await validateGlbBytes(bytes, {
        uri:
          typeof body.filename === 'string' && body.filename
            ? body.filename
            : 'asset.glb',
        maxIssues:
          Number.isInteger(body.maxIssues) &&
          body.maxIssues > 0 &&
          body.maxIssues <= 2000
            ? body.maxIssues
            : 250,
      })

      json(res, 200, {
        schema: 'phiform.gltf-validation-response.v1',
        sha256,
        byteLength: bytes.length,
        report,
      })
      return
    }


    if (req.method === 'POST' && url.pathname === '/v1/texture-jobs') {
      const body = await readJson(req, 128 * 1024 * 1024)
      const descriptor = textureEncoder.probe()

      if (!descriptor.available) {
        json(res, 400, {
          error: descriptor.statusReason || 'texture encoder unavailable',
        })
        return
      }

      if (!KTX_CODECS.includes(body.codec)) {
        json(res, 400, { error: 'unsupported texture codec' })
        return
      }

      if (
        typeof body.textureId !== 'string' ||
        !body.textureId ||
        typeof body.sourcePngBase64 !== 'string' ||
        !body.sourcePngBase64 ||
        (body.colorSpace !== 'srgb' && body.colorSpace !== 'linear')
      ) {
        json(res, 400, {
          error: 'textureId, sourcePngBase64, and srgb/linear colorSpace are required',
        })
        return
      }

      const source = Buffer.from(body.sourcePngBase64, 'base64')
      const sourceSha256 = createHash('sha256').update(source).digest('hex')

      if (
        typeof body.sourceSha256 === 'string' &&
        body.sourceSha256 &&
        body.sourceSha256 !== sourceSha256
      ) {
        json(res, 400, { error: 'source SHA-256 does not match submitted bytes' })
        return
      }

      const id = randomUUID()
      const job = {
        id,
        textureId: body.textureId,
        codec: body.codec,
        status: 'queued',
        createdAt: new Date().toISOString(),
        sourceSha256,
        sourceByteLength: source.length,
        buffer: Buffer.alloc(0),
        sha256: '',
        encoderVersion: descriptor.version || 'unknown',
        colorSpace: body.colorSpace === 'srgb' ? 'srgb' : 'linear',
        notes: [],
      }

      textureJobs.set(id, job)
      setImmediate(() => {
        executeTextureJob(job, source)
      })

      json(res, 202, publicTextureJob(job))
      return
    }

    const textureJobMatch = url.pathname.match(/^\/v1\/texture-jobs\/([0-9a-f-]+)$/)
    if (req.method === 'GET' && textureJobMatch) {
      const job = textureJobs.get(textureJobMatch[1])
      if (!job) {
        json(res, 404, { error: 'texture job not found' })
        return
      }
      json(res, 200, publicTextureJob(job))
      return
    }

    const textureArtifactMatch = url.pathname.match(
      /^\/texture-artifacts\/([0-9a-f-]+)\.ktx2$/,
    )
    if (req.method === 'GET' && textureArtifactMatch) {
      const job = textureJobs.get(textureArtifactMatch[1])
      if (!job || job.status !== 'succeeded') {
        json(res, 404, { error: 'texture artifact not found' })
        return
      }

      cors(res)
      res.writeHead(200, {
        'content-type': 'image/ktx2',
        'content-length': String(job.buffer.length),
        etag: `"${job.sha256}"`,
      })
      res.end(job.buffer)
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
    `PhiForm local bridge v0.6.0 listening on http://${host}:${port} · ${available.length}/${implementations.length} backends available\n`,
  )
})
