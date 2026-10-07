import type { BasisuTextureBinding } from '../core/types'

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const TEXTURE_PREFIX = '__PHIFORM_TEXTURE__'

interface GlbJson {
  asset?: { version?: string; generator?: string }
  buffers?: Array<{ byteLength: number }>
  bufferViews?: Array<Record<string, unknown> & {
    buffer?: number
    byteOffset?: number
    byteLength?: number
  }>
  images?: Array<Record<string, unknown> & {
    bufferView?: number
    mimeType?: string
    name?: string
  }>
  textures?: Array<Record<string, unknown> & {
    source?: number
    name?: string
    extensions?: Record<string, unknown>
  }>
  extensionsUsed?: string[]
  extensionsRequired?: string[]
  [key: string]: unknown
}

export interface VerifiedKtx2Payload {
  textureId: string
  textureName: string
  sha256: string
  bytes: Uint8Array
}

export interface BasisuRewriteResult {
  bytes: Uint8Array
  bindings: BasisuTextureBinding[]
  fallbackOnlyTextureNames: string[]
}

function align4(value: number): number {
  return (value + 3) & ~3
}

function padBytes(bytes: Uint8Array, fill: number): Uint8Array {
  const length = align4(bytes.byteLength)
  if (length === bytes.byteLength) return bytes
  const result = new Uint8Array(length)
  result.set(bytes)
  result.fill(fill, bytes.byteLength)
  return result
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.byteLength
  }
  return output
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

export function makeTextureMarker(textureId: string, name: string): string {
  return `${TEXTURE_PREFIX}${textureId}::${encodeURIComponent(name)}`
}

export function parseTextureMarker(
  value: string | undefined,
): { textureId: string; originalName: string } | undefined {
  if (!value?.startsWith(TEXTURE_PREFIX)) return undefined
  const rest = value.slice(TEXTURE_PREFIX.length)
  const separator = rest.indexOf('::')
  if (separator < 1) return undefined
  const textureId = rest.slice(0, separator)
  const encodedName = rest.slice(separator + 2)
  try {
    return {
      textureId,
      originalName: decodeURIComponent(encodedName),
    }
  } catch {
    return {
      textureId,
      originalName: encodedName,
    }
  }
}

function parseGlb(glb: Uint8Array): {
  json: GlbJson
  bin: Uint8Array
} {
  if (glb.byteLength < 20) throw new Error('GLB is too short.')
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Input is not a GLB file.')
  }
  if (view.getUint32(4, true) !== 2) {
    throw new Error('Only GLB version 2 is supported.')
  }
  if (view.getUint32(8, true) !== glb.byteLength) {
    throw new Error('GLB header length does not match actual bytes.')
  }

  let offset = 12
  let json: GlbJson | undefined
  let bin = new Uint8Array()

  while (offset + 8 <= glb.byteLength) {
    const chunkLength = view.getUint32(offset, true)
    const chunkType = view.getUint32(offset + 4, true)
    const start = offset + 8
    const end = start + chunkLength
    if (end > glb.byteLength) throw new Error('GLB chunk exceeds file length.')

    if (chunkType === JSON_CHUNK) {
      if (json) throw new Error('GLB contains multiple JSON chunks.')
      const text = new TextDecoder().decode(glb.subarray(start, end)).trimEnd()
      json = JSON.parse(text) as GlbJson
    } else if (chunkType === BIN_CHUNK) {
      if (bin.byteLength > 0) throw new Error('GLB contains multiple BIN chunks.')
      bin = glb.slice(start, end)
    }

    offset = end
  }

  if (!json) throw new Error('GLB JSON chunk is missing.')
  if (json.asset?.version !== '2.0') {
    throw new Error('GLB JSON asset.version must be 2.0.')
  }

  return { json, bin }
}

function buildGlb(json: GlbJson, bin: Uint8Array): Uint8Array {
  const jsonBytes = padBytes(
    new TextEncoder().encode(JSON.stringify(json)),
    0x20,
  )
  const binBytes = padBytes(bin, 0)

  const hasBin = binBytes.byteLength > 0
  const total =
    12 +
    8 + jsonBytes.byteLength +
    (hasBin ? 8 + binBytes.byteLength : 0)

  const header = concat([
    uint32(GLB_MAGIC),
    uint32(2),
    uint32(total),
  ])
  const jsonHeader = concat([
    uint32(jsonBytes.byteLength),
    uint32(JSON_CHUNK),
  ])

  if (!hasBin) return concat([header, jsonHeader, jsonBytes])

  const binHeader = concat([
    uint32(binBytes.byteLength),
    uint32(BIN_CHUNK),
  ])
  return concat([header, jsonHeader, jsonBytes, binHeader, binBytes])
}

export function rewriteGlbWithBasisu(
  sourceGlb: Uint8Array,
  payloads: readonly VerifiedKtx2Payload[],
): BasisuRewriteResult {
  const { json, bin } = parseGlb(sourceGlb)
  const textures = json.textures ?? []
  const images = json.images ?? (json.images = [])
  const bufferViews = json.bufferViews ?? (json.bufferViews = [])
  const buffers = json.buffers ?? (json.buffers = [{ byteLength: bin.byteLength }])

  if (buffers.length !== 1) {
    throw new Error('Rung 11 only rewrites GLBs with one embedded buffer.')
  }

  const byTextureId = new Map(
    payloads.map((payload) => [payload.textureId, payload]),
  )
  const bindings: BasisuTextureBinding[] = []
  const fallbackOnlyTextureNames: string[] = []
  const appended: Uint8Array[] = [bin]
  let logicalBinLength = bin.byteLength

  for (let textureIndex = 0; textureIndex < textures.length; textureIndex += 1) {
    const texture = textures[textureIndex]
    const marker = parseTextureMarker(texture.name)

    if (!marker) {
      fallbackOnlyTextureNames.push(texture.name || `texture-${textureIndex}`)
      continue
    }

    texture.name = marker.originalName || undefined
    const payload = byTextureId.get(marker.textureId)
    if (!payload) {
      fallbackOnlyTextureNames.push(
        marker.originalName || marker.textureId,
      )
      continue
    }

    if (typeof texture.source !== 'number') {
      throw new Error(
        `Texture ${marker.originalName || marker.textureId} has no fallback image source.`,
      )
    }

    const alignedStart = align4(logicalBinLength)
    const gap = alignedStart - logicalBinLength
    if (gap > 0) appended.push(new Uint8Array(gap))
    appended.push(payload.bytes)

    const bufferViewIndex = bufferViews.length
    bufferViews.push({
      buffer: 0,
      byteOffset: alignedStart,
      byteLength: payload.bytes.byteLength,
    })

    const imageIndex = images.length
    images.push({
      bufferView: bufferViewIndex,
      mimeType: 'image/ktx2',
      name: `${payload.textureName || marker.originalName || marker.textureId} KTX2`,
    })

    texture.extensions = {
      ...(texture.extensions ?? {}),
      KHR_texture_basisu: {
        source: imageIndex,
      },
    }

    bindings.push({
      textureId: marker.textureId,
      textureName:
        payload.textureName ||
        marker.originalName ||
        marker.textureId,
      gltfTextureIndex: textureIndex,
      fallbackImageIndex: texture.source,
      ktx2ImageIndex: imageIndex,
      ktx2Sha256: payload.sha256,
      ktx2ByteLength: payload.bytes.byteLength,
    })

    logicalBinLength = alignedStart + payload.bytes.byteLength
  }

  if (bindings.length === 0) {
    throw new Error(
      'No exported glTF textures matched verified KTX2 texture identities.',
    )
  }

  const used = new Set(json.extensionsUsed ?? [])
  used.add('KHR_texture_basisu')
  json.extensionsUsed = [...used]

  // Fallback image sources are intentionally retained, so this extension is
  // not required. Older clients can continue to use the core texture source.
  if (json.extensionsRequired?.includes('KHR_texture_basisu')) {
    json.extensionsRequired = json.extensionsRequired.filter(
      (entry) => entry !== 'KHR_texture_basisu',
    )
    if (json.extensionsRequired.length === 0) delete json.extensionsRequired
  }

  const combinedBin = concat(appended)
  buffers[0].byteLength = logicalBinLength

  return {
    bytes: buildGlb(json, combinedBin),
    bindings,
    fallbackOnlyTextureNames,
  }
}

export function inspectBasisuGlb(glb: Uint8Array): {
  extensionUsed: boolean
  extensionRequired: boolean
  textures: Array<{
    name?: string
    source?: number
    basisuSource?: number
  }>
  images: Array<{
    mimeType?: string
    bufferView?: number
  }>
  bufferByteLength: number
  bufferViews: Array<{
    buffer?: number
    byteOffset?: number
    byteLength?: number
  }>
} {
  const { json } = parseGlb(glb)
  return {
    extensionUsed:
      json.extensionsUsed?.includes('KHR_texture_basisu') ?? false,
    extensionRequired:
      json.extensionsRequired?.includes('KHR_texture_basisu') ?? false,
    textures: (json.textures ?? []).map((texture) => ({
      name: texture.name,
      source: texture.source,
      basisuSource:
        (
          texture.extensions?.KHR_texture_basisu as
            | { source?: number }
            | undefined
        )?.source,
    })),
    images: (json.images ?? []).map((image) => ({
      mimeType: image.mimeType,
      bufferView: image.bufferView,
    })),
    bufferByteLength: json.buffers?.[0]?.byteLength ?? 0,
    bufferViews: (json.bufferViews ?? []).map((view) => ({
      buffer: view.buffer,
      byteOffset: view.byteOffset,
      byteLength: view.byteLength,
    })),
  }
}
