import assert from 'node:assert/strict'
import {
  compactBasisuGlb,
  inspectCompactBasisuGlb,
  makeTextureMarker,
  rewriteGlbWithBasisu,
} from '../src/gltf/basisuGlb'

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function pad4(bytes: Uint8Array, fill: number): Uint8Array {
  const length = (bytes.length + 3) & ~3
  const output = new Uint8Array(length)
  output.set(bytes)
  output.fill(fill, bytes.length)
  return output
}

function sourceGlb(): Uint8Array {
  const json = {
    asset: { version: '2.0', generator: 'PhiForm compact fixture' },
    buffers: [{ byteLength: 24 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8, target: 34962 },
      { buffer: 0, byteOffset: 8, byteLength: 16 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 1,
        type: 'VEC2',
      },
    ],
    images: [
      {
        bufferView: 1,
        mimeType: 'image/png',
        name: 'Fallback PNG',
      },
    ],
    textures: [
      {
        source: 0,
        name: makeTextureMarker('texture-a', 'Base Color'),
      },
    ],
  }

  const jsonBytes = pad4(
    new TextEncoder().encode(JSON.stringify(json)),
    0x20,
  )
  const bin = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8,
    0x89, 0x50, 0x4e, 0x47,
    9, 10, 11, 12,
    13, 14, 15, 16,
    17, 18, 19, 20,
  ])
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length

  return concat([
    u32(GLB_MAGIC),
    u32(2),
    u32(total),
    u32(jsonBytes.length),
    u32(JSON_CHUNK),
    jsonBytes,
    u32(bin.length),
    u32(BIN_CHUNK),
    bin,
  ])
}

const ktx = new Uint8Array([
  0xab, 0x4b, 0x54, 0x58,
  0x20, 0x32, 0x30, 0xbb,
  0x0d, 0x0a, 0x1a, 0x0a,
  9, 8, 7, 6,
])

const fallback = rewriteGlbWithBasisu(sourceGlb(), [
  {
    textureId: 'texture-a',
    textureName: 'Base Color',
    sha256: 'a'.repeat(64),
    bytes: ktx,
  },
])

const before = inspectCompactBasisuGlb(fallback.bytes)
assert.equal(before.extensionUsed, true)
assert.equal(before.extensionRequired, false)
assert.equal(before.textureCount, 1)
assert.equal(before.texturesWithCoreSource, 1)
assert.equal(before.texturesWithBasisuSource, 1)
assert.equal(before.pngJpegImageCount, 1)
assert.equal(before.ktx2ImageCount, 1)
assert.equal(before.bufferViewCount, 3)
assert.equal(before.bufferByteLength, 40)

const compacted = compactBasisuGlb(fallback.bytes)
const after = inspectCompactBasisuGlb(compacted.bytes)

assert.equal(after.extensionUsed, true)
assert.equal(after.extensionRequired, true)
assert.equal(after.textureCount, 1)
assert.equal(after.texturesWithCoreSource, 0)
assert.equal(after.texturesWithBasisuSource, 1)
assert.equal(after.pngJpegImageCount, 0)
assert.equal(after.ktx2ImageCount, 1)
assert.equal(after.bufferViewCount, 2)
assert.equal(after.bufferByteLength, 24)

assert.equal(compacted.textureCount, 1)
assert.equal(compacted.removedFallbackImageCount, 1)
assert.equal(compacted.removedBufferViewCount, 1)
assert.equal(compacted.removedBinaryBytes, 16)
assert.ok(
  compacted.bytes.byteLength < fallback.bytes.byteLength,
  'compact GLB should physically shrink',
)

const partialSource = sourceGlb()
assert.throws(
  () => compactBasisuGlb(partialSource),
  /has no KHR_texture_basisu source/,
)

process.stdout.write(
  [
    'PASS full-coverage precondition',
    'PASS core texture source removed',
    'PASS KHR_texture_basisu promoted to required',
    'PASS PNG fallback image removed',
    'PASS KTX2 image retained',
    'PASS fallback bufferView removed',
    'PASS geometry bufferView retained and remapped',
    'PASS BIN payload physically repacked',
    'PASS binary bytes reclaimed',
    'PASS partial input refused',
  ].join('\n') + '\n',
)
