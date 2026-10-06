import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'

const host = process.env.PHIFORM_BRIDGE_HOST || '127.0.0.1'
const port = Number(process.env.PHIFORM_BRIDGE_PORT || 8787)
const jobs = new Map()

const backend = {
  id: 'dev.glb-proof.v1',
  label: 'Development GLB Proof',
  kind: 'proof',
  available: true,
  model: 'PhiForm procedural cube generator',
  license: 'MIT (PhiForm proof backend)',
  capabilities: {
    textTo3D: true,
    imageTo3D: false,
    multiView: false,
    glbOutput: true,
  },
}

function hashText(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pad4(buffer, fill = 0) {
  const padding = (4 - (buffer.length % 4)) % 4
  return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, fill)])
}

function createCubeGlb(seed) {
  const positions = new Float32Array([
    -1,-1, 1,  1,-1, 1,  1, 1, 1, -1, 1, 1,
     1,-1,-1, -1,-1,-1, -1, 1,-1,  1, 1,-1,
    -1, 1, 1,  1, 1, 1,  1, 1,-1, -1, 1,-1,
    -1,-1,-1,  1,-1,-1,  1,-1, 1, -1,-1, 1,
     1,-1, 1,  1,-1,-1,  1, 1,-1,  1, 1, 1,
    -1,-1,-1, -1,-1, 1, -1, 1, 1, -1, 1,-1,
  ])

  const normals = new Float32Array([
     0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
     0, 0,-1,  0, 0,-1,  0, 0,-1,  0, 0,-1,
     0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
     0,-1, 0,  0,-1, 0,  0,-1, 0,  0,-1, 0,
     1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ])

  const indices = new Uint16Array([
     0, 1, 2,  0, 2, 3,
     4, 5, 6,  4, 6, 7,
     8, 9,10,  8,10,11,
    12,13,14, 12,14,15,
    16,17,18, 16,18,19,
    20,21,22, 20,22,23,
  ])

  const positionBytes = Buffer.from(
    positions.buffer,
    positions.byteOffset,
    positions.byteLength,
  )
  const normalBytes = Buffer.from(
    normals.buffer,
    normals.byteOffset,
    normals.byteLength,
  )
  const indexBytes = Buffer.from(
    indices.buffer,
    indices.byteOffset,
    indices.byteLength,
  )
  const binary = Buffer.concat([positionBytes, normalBytes, indexBytes])

  const tint = [
    0.35 + ((seed >>> 2) % 45) / 100,
    0.45 + ((seed >>> 8) % 35) / 100,
    0.55 + ((seed >>> 14) % 35) / 100,
    1,
  ]

  const gltf = {
    asset: { version: '2.0', generator: 'PhiForm dev.glb-proof.v1' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'PhiFormProofCube' }],
    meshes: [{
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0,
      }],
    }],
    materials: [{
      name: 'PhiFormProofMaterial',
      pbrMetallicRoughness: {
        baseColorFactor: tint,
        metallicFactor: 0.35,
        roughnessFactor: 0.42,
      },
    }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 24,
        type: 'VEC3',
        min: [-1, -1, -1],
        max: [1, 1, 1],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 24,
        type: 'VEC3',
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: 36,
        type: 'SCALAR',
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: positionBytes.length,
        byteLength: normalBytes.length,
        target: 34962,
      },
      {
        buffer: 0,
        byteOffset: positionBytes.length + normalBytes.length,
        byteLength: indexBytes.length,
        target: 34963,
      },
    ],
    buffers: [{ byteLength: binary.length }],
  }

  const json = pad4(Buffer.from(JSON.stringify(gltf)), 0x20)
  const bin = pad4(binary, 0x00)
  const totalLength = 12 + 8 + json.length + 8 + bin.length
  const output = Buffer.alloc(totalLength)
  let offset = 0

  output.writeUInt32LE(0x46546c67, offset); offset += 4
  output.writeUInt32LE(2, offset); offset += 4
  output.writeUInt32LE(totalLength, offset); offset += 4

  output.writeUInt32LE(json.length, offset); offset += 4
  output.writeUInt32LE(0x4e4f534a, offset); offset += 4
  json.copy(output, offset); offset += json.length

  output.writeUInt32LE(bin.length, offset); offset += 4
  output.writeUInt32LE(0x004e4942, offset); offset += 4
  bin.copy(output, offset)

  return output
}

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
        bridgeVersion: '0.2.0',
      })
      return
    }

    if (req.method === 'GET' && url.pathname === '/v1/backends') {
      json(res, 200, { backends: [backend] })
      return
    }

    if (req.method === 'POST' && url.pathname === '/v1/jobs') {
      const body = await readJson(req)

      if (body.backendId !== backend.id) {
        json(res, 400, { error: 'unknown or unavailable backend' })
        return
      }

      if (!String(body.prompt || '').trim() && !body.image) {
        json(res, 400, { error: 'prompt or image input is required' })
        return
      }

      if (body.image && backend.capabilities.imageTo3D === false) {
        json(res, 400, {
          error: 'development proof backend does not declare image-to-3D capability',
        })
        return
      }

      const seed = hashText([
        String(body.prompt || ''),
        String(body.image?.name || ''),
        String(body.image?.size || 0),
      ].join('|') || 'phiform')
      const buffer = createCubeGlb(seed)
      const id = randomUUID()
      const job = {
        id,
        backendId: backend.id,
        status: 'queued',
        seed,
        createdAt: new Date().toISOString(),
        buffer,
        sha256: createHash('sha256').update(buffer).digest('hex'),
        notes: [
          'Development GLB proof backend.',
          'No neural inference was performed.',
          'Artifact hash is SHA-256 over the served GLB bytes.',
        ],
      }

      jobs.set(id, job)
      setTimeout(() => {
        const current = jobs.get(id)
        if (current) current.status = 'running'
      }, 30)
      setTimeout(() => {
        const current = jobs.get(id)
        if (current) current.status = 'succeeded'
      }, 120)

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
  process.stdout.write(
    `PhiForm local bridge listening on http://${host}:${port}\n`,
  )
})
