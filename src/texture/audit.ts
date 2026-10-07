import * as THREE from 'three'
import type {
  MaterialAuditEntry,
  ModelArtifact,
  TextureAudit,
  TextureAuditEntry,
  TextureColorExpectation,
  TextureCompressionPlanEntry,
  TextureProfileId,
  TextureReceipt,
  TextureRole,
} from '../core/types'
import { textureProfile } from './profiles'

type TextureSlot = {
  role: TextureRole
  key: string
}

const TEXTURE_SLOTS: TextureSlot[] = [
  { role: 'base-color', key: 'map' },
  { role: 'emissive', key: 'emissiveMap' },
  { role: 'normal', key: 'normalMap' },
  { role: 'roughness', key: 'roughnessMap' },
  { role: 'metalness', key: 'metalnessMap' },
  { role: 'occlusion', key: 'aoMap' },
  { role: 'alpha', key: 'alphaMap' },
  { role: 'bump', key: 'bumpMap' },
  { role: 'displacement', key: 'displacementMap' },
  { role: 'light', key: 'lightMap' },
]

type TextureBearingMaterial = THREE.Material & Record<string, unknown>

function expectedColorSpace(role: TextureRole): TextureColorExpectation {
  return role === 'base-color' || role === 'emissive' ? 'srgb' : 'linear'
}

function dimensions(texture: THREE.Texture): { width: number; height: number } {
  const source = texture.source?.data as
    | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
    | undefined
  const image = texture.image as
    | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
    | undefined

  const width = Number(
    source?.width ??
    source?.videoWidth ??
    image?.width ??
    image?.videoWidth ??
    0,
  )
  const height = Number(
    source?.height ??
    source?.videoHeight ??
    image?.height ??
    image?.videoHeight ??
    0,
  )

  return {
    width: Number.isFinite(width) && width > 0 ? Math.floor(width) : 0,
    height: Number.isFinite(height) && height > 0 ? Math.floor(height) : 0,
  }
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0
}

function estimatedGpuBytes(
  width: number,
  height: number,
  generateMipmaps: boolean,
): number {
  if (width <= 0 || height <= 0) return 0
  const base = width * height * 4
  return Math.ceil(generateMipmaps ? base * (4 / 3) : base)
}

function textureChannel(texture: THREE.Texture): number {
  const candidate = texture as THREE.Texture & { channel?: number }
  return Number.isFinite(candidate.channel) ? Number(candidate.channel) : 0
}

function colorSpaceLabel(texture: THREE.Texture): string {
  return texture.colorSpace || 'linear/no-color-space'
}

function colorSpaceMatches(
  texture: THREE.Texture,
  expectations: TextureColorExpectation[],
): boolean {
  if (expectations.length === 0) return true
  if (new Set(expectations).size > 1) return false

  const expected = expectations[0]
  return expected === 'srgb'
    ? texture.colorSpace === THREE.SRGBColorSpace
    : texture.colorSpace !== THREE.SRGBColorSpace
}

function textureFromSlot(
  material: TextureBearingMaterial,
  key: string,
): THREE.Texture | undefined {
  const value = material[key]
  return value instanceof THREE.Texture ? value : undefined
}

function materialName(material: THREE.Material, fallback: number): string {
  return material.name || `Material ${fallback + 1}`
}

export function auditTextures(
  object: THREE.Object3D,
  profileId: TextureProfileId,
): TextureAudit {
  const profile = textureProfile(profileId)
  const textureRoles = new Map<string, {
    texture: THREE.Texture
    roles: Set<TextureRole>
  }>()
  const materials: MaterialAuditEntry[] = []
  let materialIndex = 0

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const meshMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material]

    for (const rawMaterial of meshMaterials) {
      const material = rawMaterial as TextureBearingMaterial
      const textureIds = new Set<string>()
      const slotTextures = new Map<TextureRole, THREE.Texture>()

      for (const slot of TEXTURE_SLOTS) {
        const texture = textureFromSlot(material, slot.key)
        if (!texture) continue

        slotTextures.set(slot.role, texture)
        textureIds.add(texture.uuid)

        const existing = textureRoles.get(texture.uuid)
        if (existing) {
          existing.roles.add(slot.role)
        } else {
          textureRoles.set(texture.uuid, {
            texture,
            roles: new Set<TextureRole>([slot.role]),
          })
        }
      }

      const roughness = slotTextures.get('roughness')
      const metalness = slotTextures.get('metalness')
      const occlusion = slotTextures.get('occlusion')
      const packedOrmTextureId =
        roughness &&
        metalness &&
        roughness.uuid === metalness.uuid &&
        (!occlusion || occlusion.uuid === roughness.uuid)
          ? roughness.uuid
          : undefined

      const issues: string[] = []
      if (textureIds.size === 0) {
        issues.push('Material has no texture maps.')
      }

      materials.push({
        id: rawMaterial.uuid,
        name: materialName(rawMaterial, materialIndex),
        type: rawMaterial.type,
        textureIds: [...textureIds].sort(),
        packedOrmTextureId,
        issues,
      })
      materialIndex += 1
    }
  })

  const textures: TextureAuditEntry[] = [...textureRoles.entries()]
    .map(([id, record]) => {
      const { width, height } = dimensions(record.texture)
      const roles = [...record.roles].sort() as TextureRole[]
      const expectedColorSpaces = [...new Set(
        roles.map(expectedColorSpace),
      )].sort() as TextureColorExpectation[]
      const maxDimension = Math.max(width, height)
      const overDimensionBudget =
        profile.maxDimension !== null &&
        maxDimension > profile.maxDimension

      return {
        id,
        name: record.texture.name || id.slice(0, 12),
        roles,
        width,
        height,
        maxDimension,
        powerOfTwo: isPowerOfTwo(width) && isPowerOfTwo(height),
        colorSpace: colorSpaceLabel(record.texture),
        expectedColorSpaces,
        colorSpaceMatch: colorSpaceMatches(
          record.texture,
          expectedColorSpaces,
        ),
        channel: textureChannel(record.texture),
        estimatedGpuBytes: estimatedGpuBytes(
          width,
          height,
          record.texture.generateMipmaps !== false,
        ),
        overDimensionBudget,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const totals = {
    textures: textures.length,
    materials: materials.length,
    uniquePixels: textures.reduce(
      (sum, texture) => sum + texture.width * texture.height,
      0,
    ),
    estimatedGpuBytes: textures.reduce(
      (sum, texture) => sum + texture.estimatedGpuBytes,
      0,
    ),
    oversizedTextures: textures.filter(
      (texture) => texture.overDimensionBudget,
    ).length,
    colorSpaceMismatches: textures.filter(
      (texture) => !texture.colorSpaceMatch,
    ).length,
    materialsWithoutTextures: materials.filter(
      (material) => material.textureIds.length === 0,
    ).length,
    packedOrmMaterials: materials.filter(
      (material) => material.packedOrmTextureId,
    ).length,
  }

  const notes: string[] = []
  let qualification: TextureAudit['qualification'] = 'pass'

  const unknownDimensions = textures.filter(
    (texture) => texture.width === 0 || texture.height === 0,
  ).length
  const conflictingColorRoles = textures.filter(
    (texture) => new Set(texture.expectedColorSpaces).size > 1,
  ).length

  if (conflictingColorRoles > 0) {
    qualification = 'fail'
    notes.push(
      `${conflictingColorRoles} texture object(s) are reused across incompatible sRGB and linear-data roles.`,
    )
  }

  if (totals.colorSpaceMismatches > 0) {
    if (qualification === 'pass') qualification = 'warning'
    notes.push(
      `${totals.colorSpaceMismatches} texture object(s) do not match their expected color-space role.`,
    )
  }

  if (totals.oversizedTextures > 0) {
    if (qualification === 'pass') qualification = 'warning'
    notes.push(
      `${totals.oversizedTextures} texture(s) exceed the ${profile.label} dimension budget.`,
    )
  }

  if (
    profile.maxEstimatedGpuBytes !== null &&
    totals.estimatedGpuBytes > profile.maxEstimatedGpuBytes
  ) {
    if (qualification === 'pass') qualification = 'warning'
    notes.push(
      `Estimated RGBA8+mipmap GPU memory exceeds the ${profile.label} budget.`,
    )
  }

  if (unknownDimensions > 0) {
    if (qualification === 'pass') qualification = 'warning'
    notes.push(
      `${unknownDimensions} texture(s) have dimensions unavailable to the browser audit.`,
    )
  }

  if (profile.requirePowerOfTwo) {
    const nonPot = textures.filter((texture) => !texture.powerOfTwo).length
    if (nonPot > 0) {
      if (qualification === 'pass') qualification = 'warning'
      notes.push(`${nonPot} texture(s) are not power-of-two.`)
    }
  }

  if (totals.textures === 0) {
    notes.push('No texture maps were detected on the current scene materials.')
  } else if (notes.length === 0) {
    notes.push('No texture/material issues were detected for the selected profile.')
  }

  if (totals.packedOrmMaterials > 0) {
    notes.push(
      `${totals.packedOrmMaterials} material(s) reuse one texture object for metallic/roughness/occlusion packing.`,
    )
  }

  return {
    profileId,
    textures,
    materials,
    totals,
    qualification,
    notes,
  }
}

export function compressionPlan(
  audit: TextureAudit,
): TextureCompressionPlanEntry[] {
  return audit.textures.map((texture) => {
    const highFidelity = texture.roles.some((role) =>
      role === 'normal' ||
      role === 'bump' ||
      role === 'displacement'
    )

    return {
      textureId: texture.id,
      roles: [...texture.roles],
      target: 'ktx2-basisu',
      mode: highFidelity ? 'uastc' : 'etc1s',
      status: 'planned-not-executed',
      reason: highFidelity
        ? 'Normal/height detail favors UASTC-style quality.'
        : 'Color and scalar maps are candidates for ETC1S-style compact delivery.',
    }
  })
}

export function buildTextureReceipt(
  artifact: ModelArtifact,
  nodeId: string,
  audit: TextureAudit,
  createdAt = new Date().toISOString(),
): TextureReceipt {
  return {
    schema: 'phiform.texture-receipt.v1',
    id: `texture-receipt-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`,
    createdAt,
    sourceArtifactId: artifact.id,
    sourceNodeId: nodeId,
    profileId: audit.profileId,
    audit,
    compressionPlan: compressionPlan(audit),
    compressionExecuted: false,
    notes: [
      'Texture audit estimates decoded RGBA8 GPU memory from dimensions and mipmap intent.',
      'KTX2/Basis Universal entries are planning recommendations only in Rung 9.',
      'No compressed texture bytes are claimed unless a later encoder step produces and hashes them.',
    ],
  }
}
