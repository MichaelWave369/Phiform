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

  const positionBytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength)
  const normalBytes = Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength)
  const indexBytes = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength)
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
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{
      name: 'PhiFormProofMaterial',
      pbrMetallicRoughness: {
        baseColorFactor: tint,
        metallicFactor: 0.35,
        roughnessFactor: 0.42,
      },
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-1,-1,-1], max: [1,1,1] },
      { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.length, byteLength: normalBytes.length, target: 34962 },
      { buffer: 0, byteOffset: positionBytes.length + normalBytes.length, byteLength: indexBytes.length, target: 34963 },
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

export const proofBackend = {
  descriptor: {
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
  },

  validate(body) {
    if (!String(body.prompt || '').trim()) {
      return 'development proof backend requires a text prompt'
    }
    if (body.image) {
      return 'development proof backend does not declare image-to-3D capability'
    }
    return null
  },

  async run(body) {
    const seed = hashText([
      String(body.prompt || ''),
      String(body.image?.name || ''),
      String(body.image?.size || 0),
    ].join('|') || 'phiform')

    await new Promise((resolve) => setTimeout(resolve, 120))
    return {
      buffer: createCubeGlb(seed),
      seed,
      seedKind: 'request-fingerprint',
      notes: [
        'Development GLB proof backend.',
        'No neural inference was performed.',
        'Receipt seed is a deterministic request fingerprint, not an inference RNG seed.',
      ],
    }
  },
}
