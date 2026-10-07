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


export interface BasisuCompactResult {
  bytes: Uint8Array
  textureCount: number
  removedFallbackImageCount: number
  removedBufferViewCount: number
  removedBinaryBytes: number
}

function basisuImageIndex(
  texture: NonNullable<GlbJson['textures']>[number],
): number | undefined {
  const extension = texture.extensions?.KHR_texture_basisu as
    | { source?: number }
    | undefined
  return typeof extension?.source === 'number'
    ? extension.source
    : undefined
}

function collectBufferViewReferences(
  value: unknown,
  output: Set<number>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectBufferViewReferences(item, output)
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'bufferView' && typeof item === 'number') {
      output.add(item)
    } else {
      collectBufferViewReferences(item, output)
    }
  }
}

function remapBufferViewReferences(
  value: unknown,
  remap: ReadonlyMap<number, number>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) remapBufferViewReferences(item, remap)
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'bufferView' && typeof item === 'number') {
      const next = remap.get(item)
      if (next === undefined) {
        throw new Error(
          `GLB object still references removed bufferView ${item}.`,
        )
      }
      ;(value as Record<string, unknown>)[key] = next
    } else {
      remapBufferViewReferences(item, remap)
    }
  }
}

export function compactBasisuGlb(
  fallbackGlb: Uint8Array,
): BasisuCompactResult {
  const { json, bin } = parseGlb(fallbackGlb)
  const textures = json.textures ?? []
  const images = json.images ?? []
  const oldBufferViews = json.bufferViews ?? []
  const buffers = json.buffers ?? []

  if (textures.length === 0) {
    throw new Error('Compact BasisU GLB has no textures to process.')
  }
  if (buffers.length !== 1) {
    throw new Error('Rung 12 only compacts GLBs with one embedded buffer.')
  }

  const fallbackImages = new Set<number>()
  const basisuImages = new Set<number>()

  for (let index = 0; index < textures.length; index += 1) {
    const texture = textures[index]
    const basisu = basisuImageIndex(texture)
    if (basisu === undefined) {
      throw new Error(
        `Texture ${texture.name || index} has no KHR_texture_basisu source; full coverage is required for compaction.`,
      )
    }
    if (typeof texture.source !== 'number') {
      throw new Error(
        `Texture ${texture.name || index} has no core fallback source; input is not a Rung 11 fallback-bearing GLB.`,
      )
    }
    if (!images[basisu]) {
      throw new Error(
        `Texture ${texture.name || index} points to missing KTX2 image ${basisu}.`,
      )
    }
    if (images[basisu].mimeType !== 'image/ktx2') {
      throw new Error(
        `Texture ${texture.name || index} BasisU source is not image/ktx2.`,
      )
    }

    fallbackImages.add(texture.source)
    basisuImages.add(basisu)
  }

  for (const imageIndex of fallbackImages) {
    if (basisuImages.has(imageIndex)) {
      throw new Error(
        `Image ${imageIndex} is simultaneously a fallback and BasisU image.`,
      )
    }
  }

  for (const texture of textures) delete texture.source

  const imageRemap = new Map<number, number>()
  const keptImages: NonNullable<GlbJson['images']> = []
  for (let oldIndex = 0; oldIndex < images.length; oldIndex += 1) {
    if (fallbackImages.has(oldIndex)) continue
    imageRemap.set(oldIndex, keptImages.length)
    keptImages.push(images[oldIndex])
  }

  for (let index = 0; index < textures.length; index += 1) {
    const texture = textures[index]
    const oldSource = basisuImageIndex(texture)
    if (oldSource === undefined) {
      throw new Error(
        `Texture ${texture.name || index} lost its BasisU source during compaction.`,
      )
    }
    const nextSource = imageRemap.get(oldSource)
    if (nextSource === undefined) {
      throw new Error(
        `Texture ${texture.name || index} BasisU image was removed unexpectedly.`,
      )
    }
    texture.extensions = {
      ...(texture.extensions ?? {}),
      KHR_texture_basisu: { source: nextSource },
    }
  }

  json.images = keptImages

  const usedExtensions = new Set(json.extensionsUsed ?? [])
  usedExtensions.add('KHR_texture_basisu')
  json.extensionsUsed = [...usedExtensions]

  const requiredExtensions = new Set(json.extensionsRequired ?? [])
  requiredExtensions.add('KHR_texture_basisu')
  json.extensionsRequired = [...requiredExtensions]

  const referencedBufferViews = new Set<number>()
  collectBufferViewReferences(json, referencedBufferViews)

  const sortedViews = [...referencedBufferViews].sort((a, b) => a - b)
  for (const index of sortedViews) {
    if (!oldBufferViews[index]) {
      throw new Error(`GLB references missing bufferView ${index}.`)
    }
  }

  const viewRemap = new Map<number, number>()
  sortedViews.forEach((oldIndex, newIndex) => {
    viewRemap.set(oldIndex, newIndex)
  })
  remapBufferViewReferences(json, viewRemap)

  const oldLogicalByteLength = buffers[0]?.byteLength ?? bin.byteLength
  if (oldLogicalByteLength > bin.byteLength) {
    throw new Error(
      'GLB buffer byteLength exceeds the available BIN chunk bytes.',
    )
  }

  const rebuiltViews: NonNullable<GlbJson['bufferViews']> = []
  const parts: Uint8Array[] = []
  let logicalByteLength = 0

  for (const oldIndex of sortedViews) {
    const sourceView = oldBufferViews[oldIndex]
    const bufferIndex = sourceView.buffer ?? 0
    if (bufferIndex !== 0) {
      throw new Error(
        `bufferView ${oldIndex} references unsupported buffer ${bufferIndex}.`,
      )
    }

    const sourceOffset = sourceView.byteOffset ?? 0
    const sourceLength = sourceView.byteLength ?? 0
    const sourceEnd = sourceOffset + sourceLength
    if (
      sourceOffset < 0 ||
      sourceLength < 0 ||
      sourceEnd > oldLogicalByteLength
    ) {
      throw new Error(
        `bufferView ${oldIndex} exceeds the source BIN bounds.`,
      )
    }

    const alignedOffset = align4(logicalByteLength)
    if (alignedOffset > logicalByteLength) {
      parts.push(new Uint8Array(alignedOffset - logicalByteLength))
    }

    parts.push(bin.slice(sourceOffset, sourceEnd))
    rebuiltViews.push({
      ...sourceView,
      buffer: 0,
      byteOffset: alignedOffset,
      byteLength: sourceLength,
    })

    logicalByteLength = alignedOffset + sourceLength
  }

  json.bufferViews = rebuiltViews
  buffers[0].byteLength = logicalByteLength
  json.buffers = buffers

  const rebuiltBin = concat(parts)
  const removedBinaryBytes = Math.max(
    0,
    oldLogicalByteLength - logicalByteLength,
  )

  return {
    bytes: buildGlb(json, rebuiltBin),
    textureCount: textures.length,
    removedFallbackImageCount: fallbackImages.size,
    removedBufferViewCount:
      oldBufferViews.length - rebuiltViews.length,
    removedBinaryBytes,
  }
}

export function inspectCompactBasisuGlb(glb: Uint8Array): {
  extensionUsed: boolean
  extensionRequired: boolean
  textureCount: number
  texturesWithCoreSource: number
  texturesWithBasisuSource: number
  pngJpegImageCount: number
  ktx2ImageCount: number
  bufferViewCount: number
  bufferByteLength: number
} {
  const { json } = parseGlb(glb)
  const textures = json.textures ?? []
  const images = json.images ?? []

  return {
    extensionUsed:
      json.extensionsUsed?.includes('KHR_texture_basisu') ?? false,
    extensionRequired:
      json.extensionsRequired?.includes('KHR_texture_basisu') ?? false,
    textureCount: textures.length,
    texturesWithCoreSource: textures.filter(
      (texture) => typeof texture.source === 'number',
    ).length,
    texturesWithBasisuSource: textures.filter(
      (texture) => basisuImageIndex(texture) !== undefined,
    ).length,
    pngJpegImageCount: images.filter(
      (image) =>
        image.mimeType === 'image/png' ||
        image.mimeType === 'image/jpeg',
    ).length,
    ktx2ImageCount: images.filter(
      (image) => image.mimeType === 'image/ktx2',
    ).length,
    bufferViewCount: json.bufferViews?.length ?? 0,
    bufferByteLength: json.buffers?.[0]?.byteLength ?? 0,
  }
}
