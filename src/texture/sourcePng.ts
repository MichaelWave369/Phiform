import * as THREE from 'three'
import type {
  TextureAudit,
  TextureRole,
} from '../core/types'

const SLOT_KEYS: Array<{ key: string; role: TextureRole }> = [
  { key: 'map', role: 'base-color' },
  { key: 'emissiveMap', role: 'emissive' },
  { key: 'normalMap', role: 'normal' },
  { key: 'roughnessMap', role: 'roughness' },
  { key: 'metalnessMap', role: 'metalness' },
  { key: 'aoMap', role: 'occlusion' },
  { key: 'alphaMap', role: 'alpha' },
  { key: 'bumpMap', role: 'bump' },
  { key: 'displacementMap', role: 'displacement' },
  { key: 'lightMap', role: 'light' },
]

type TextureMaterial = THREE.Material & Record<string, unknown>

export interface PreparedTexturePng {
  textureId: string
  name: string
  roles: TextureRole[]
  colorSpace: 'srgb' | 'linear'
  width: number
  height: number
  blob: Blob
  sha256: string
}

function uniqueTextureObjects(object: THREE.Object3D): Map<string, THREE.Texture> {
  const textures = new Map<string, THREE.Texture>()

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]

    for (const raw of materials) {
      const material = raw as TextureMaterial
      for (const slot of SLOT_KEYS) {
        const value = material[slot.key]
        if (value instanceof THREE.Texture) {
          textures.set(value.uuid, value)
        }
      }
    }
  })

  return textures
}

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', {
    alpha: true,
    colorSpace: 'srgb',
    willReadFrequently: true,
  })
  if (!context) throw new Error('Canvas 2D context is unavailable.')
  return { canvas, context }
}

function dataTexturePixels(
  texture: THREE.Texture,
  width: number,
  height: number,
): Uint8ClampedArray | undefined {
  const image = texture.image as
    | { data?: ArrayBufferView; width?: number; height?: number }
    | undefined

  if (
    !image?.data ||
    texture.type !== THREE.UnsignedByteType ||
    !ArrayBuffer.isView(image.data)
  ) {
    return undefined
  }

  const source = new Uint8Array(
    image.data.buffer,
    image.data.byteOffset,
    image.data.byteLength,
  )
  const pixels = width * height
  const rgba = new Uint8ClampedArray(pixels * 4)

  if (texture.format === THREE.RGBAFormat && source.length >= pixels * 4) {
    rgba.set(source.subarray(0, pixels * 4))
    return rgba
  }

  if (texture.format === THREE.RGFormat && source.length >= pixels * 2) {
    for (let index = 0; index < pixels; index += 1) {
      rgba[index * 4] = source[index * 2]
      rgba[index * 4 + 1] = source[index * 2 + 1]
      rgba[index * 4 + 2] = 0
      rgba[index * 4 + 3] = 255
    }
    return rgba
  }

  if (texture.format === THREE.RedFormat && source.length >= pixels) {
    for (let index = 0; index < pixels; index += 1) {
      const value = source[index]
      rgba[index * 4] = value
      rgba[index * 4 + 1] = value
      rgba[index * 4 + 2] = value
      rgba[index * 4 + 3] = 255
    }
    return rgba
  }

  return undefined
}

async function textureToPng(
  texture: THREE.Texture,
  width: number,
  height: number,
): Promise<Blob> {
  if (width <= 0 || height <= 0) {
    throw new Error('Texture dimensions are unavailable.')
  }

  const { canvas, context } = canvas2d(width, height)
  const raw = dataTexturePixels(texture, width, height)

  if (raw) {
    const owned = new Uint8ClampedArray(raw.length)
    owned.set(raw)
    context.putImageData(new ImageData(owned, width, height), 0, 0)
  } else {
    if (texture.type !== THREE.UnsignedByteType) {
      throw new Error(
        'Rung 10 only encodes 8-bit LDR textures; float/HDR textures remain unmodified.',
      )
    }

    const image = texture.image
    if (!image) throw new Error('Texture has no browser-readable image source.')

    try {
      context.drawImage(image as CanvasImageSource, 0, 0, width, height)
    } catch (cause) {
      throw new Error(
        cause instanceof Error
          ? `Texture pixels could not be normalized through Canvas: ${cause.message}`
          : 'Texture pixels could not be normalized through Canvas.',
      )
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => value
        ? resolve(value)
        : reject(new Error('Canvas PNG encoding returned no bytes.')),
      'image/png',
    )
  })

  return blob
}

async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export async function prepareTexturePngSources(
  object: THREE.Object3D,
  audit: TextureAudit,
): Promise<PreparedTexturePng[]> {
  if (audit.qualification === 'fail') {
    throw new Error(
      'Texture compression is blocked because the current texture audit is FAIL.',
    )
  }

  const inventory = uniqueTextureObjects(object)
  const prepared: PreparedTexturePng[] = []

  for (const entry of audit.textures) {
    const texture = inventory.get(entry.id)
    if (!texture) {
      throw new Error(`Texture object ${entry.name} is no longer present in the scene.`)
    }

    if (entry.expectedColorSpaces.length !== 1) {
      throw new Error(
        `Texture ${entry.name} does not have one unambiguous color-space role.`,
      )
    }

    const colorSpace = entry.expectedColorSpaces[0] === 'srgb'
      ? 'srgb'
      : 'linear'

    const blob = await textureToPng(texture, entry.width, entry.height)
    prepared.push({
      textureId: entry.id,
      name: entry.name,
      roles: [...entry.roles],
      colorSpace,
      width: entry.width,
      height: entry.height,
      sha256: await sha256Blob(blob),
      blob,
    })
  }

  return prepared
}
