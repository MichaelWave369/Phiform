import type { TextureProfileId } from '../core/types'

export interface TextureProfile {
  id: TextureProfileId
  label: string
  maxDimension: number | null
  maxEstimatedGpuBytes: number | null
  requirePowerOfTwo: boolean
}

export const TEXTURE_PROFILES: Record<TextureProfileId, TextureProfile> = {
  'archive-textures': {
    id: 'archive-textures',
    label: 'Archive Textures',
    maxDimension: null,
    maxEstimatedGpuBytes: null,
    requirePowerOfTwo: false,
  },
  'web-textures': {
    id: 'web-textures',
    label: 'Web Textures',
    maxDimension: 2048,
    maxEstimatedGpuBytes: 256 * 1024 * 1024,
    requirePowerOfTwo: false,
  },
  'game-textures': {
    id: 'game-textures',
    label: 'Game Textures',
    maxDimension: 4096,
    maxEstimatedGpuBytes: 512 * 1024 * 1024,
    requirePowerOfTwo: false,
  },
}

export function textureProfile(id: TextureProfileId): TextureProfile {
  return TEXTURE_PROFILES[id]
}
