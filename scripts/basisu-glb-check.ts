import assert from 'node:assert/strict'
import {
  inspectBasisuGlb,
  makeTextureMarker,
  parseTextureMarker,
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

function fixtureGlb(): Uint8Array {
  const json = {
    asset: { version: '2.0', generator: 'PhiForm test fixture' },
    buffers: [{ byteLength: 4 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 4 },
    ],
    images: [
      { bufferView: 0, mimeType: 'image/png', name: 'Fallback PNG' },
    ],
    textures: [
      {
        source: 0,
        name: makeTextureMarker('texture-a', 'Base Color'),
      },
      {
        source: 0,
        name: 'Unbound Texture',
      },
    ],
  }

  const jsonBytes = pad4(
    new TextEncoder().encode(JSON.stringify(json)),
    0x20,
  )
  const bin = new Uint8Array([1, 2, 3, 4])
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

const marker = makeTextureMarker('abc-123', 'Paint / Base')
assert.deepEqual(parseTextureMarker(marker), {
  textureId: 'abc-123',
  originalName: 'Paint / Base',
})

const ktx = new Uint8Array([
  0xab, 0x4b, 0x54, 0x58,
  0x20, 0x32, 0x30, 0xbb,
  0x0d, 0x0a, 0x1a, 0x0a,
  9, 8, 7, 6, 5, 4, 3,
])

const source = fixtureGlb()
const result = rewriteGlbWithBasisu(source, [
  {
    textureId: 'texture-a',
    textureName: 'Base Color',
    sha256: 'a'.repeat(64),
    bytes: ktx,
  },
  {
    textureId: 'texture-unused',
    textureName: 'Unused Executed Texture',
    sha256: 'b'.repeat(64),
    bytes: ktx,
  },
])

const header = new DataView(
  result.bytes.buffer,
  result.bytes.byteOffset,
  result.bytes.byteLength,
)
assert.equal(header.getUint32(0, true), GLB_MAGIC)
assert.equal(header.getUint32(4, true), 2)
assert.equal(header.getUint32(8, true), result.bytes.byteLength)

assert.equal(result.bindings.length, 1)
assert.equal(result.bindings[0]?.textureId, 'texture-a')
assert.equal(result.bindings[0]?.gltfTextureIndex, 0)
assert.equal(result.bindings[0]?.fallbackImageIndex, 0)
assert.equal(result.bindings[0]?.ktx2ImageIndex, 1)
assert.equal(result.bindings[0]?.ktx2ByteLength, ktx.byteLength)
assert.deepEqual(result.fallbackOnlyTextureNames, ['Unbound Texture'])

const inspected = inspectBasisuGlb(result.bytes)
assert.equal(inspected.extensionUsed, true)
assert.equal(inspected.extensionRequired, false)
assert.equal(inspected.textures[0]?.name, 'Base Color')
assert.equal(inspected.textures[0]?.source, 0)
assert.equal(inspected.textures[0]?.basisuSource, 1)
assert.equal(inspected.textures[1]?.source, 0)
assert.equal(inspected.textures[1]?.basisuSource, undefined)
assert.equal(inspected.images[0]?.mimeType, 'image/png')
assert.equal(inspected.images[1]?.mimeType, 'image/ktx2')

assert.equal(inspected.bufferViews.length, 2)
const ktxView = inspected.bufferViews[1]
assert.ok(ktxView)
assert.equal((ktxView?.byteOffset ?? -1) % 4, 0)
assert.equal(ktxView?.byteOffset, 4)
assert.equal(ktxView?.byteLength, ktx.byteLength)
assert.equal(inspected.bufferByteLength, 4 + ktx.byteLength)

assert.throws(
  () => rewriteGlbWithBasisu(source, []),
  /No exported glTF textures matched verified KTX2 texture identities/,
)

process.stdout.write(
  [
    'PASS texture identity marker round-trip',
    'PASS GLB v2 header rebuilt',
    'PASS fallback image source preserved',
    'PASS KHR_texture_basisu extension attached',
    'PASS extension stays optional with fallback',
    'PASS image/ktx2 bufferView appended',
    'PASS KTX2 payload 4-byte aligned',
    'PASS logical buffer byte length updated',
    'PASS fallback-only texture accounting',
    'PASS unused payload does not invent a binding',
  ].join('\n') + '\n',
)
