import type { ProductionProfileId } from '../core/types'

export interface ProductionProfile {
  id: ProductionProfileId
  label: string
  target: 'archive' | 'web' | 'godot' | 'unreal'
  maxTriangles: number | null
  lodRatios: number[]
  recomputeNormals: boolean
  dropDegenerateTriangles: boolean
  requireUvs: boolean
}

export const PRODUCTION_PROFILES: Record<ProductionProfileId, ProductionProfile> = {
  'archive-glb': {
    id: 'archive-glb',
    label: 'Archive GLB',
    target: 'archive',
    maxTriangles: null,
    lodRatios: [1],
    recomputeNormals: false,
    dropDegenerateTriangles: false,
    requireUvs: false,
  },
  'web-balanced': {
    id: 'web-balanced',
    label: 'Web Balanced',
    target: 'web',
    maxTriangles: 60000,
    lodRatios: [1, 0.5, 0.2],
    recomputeNormals: true,
    dropDegenerateTriangles: true,
    requireUvs: true,
  },
  'godot-game': {
    id: 'godot-game',
    label: 'Godot Game',
    target: 'godot',
    maxTriangles: 80000,
    lodRatios: [1, 0.5, 0.25],
    recomputeNormals: true,
    dropDegenerateTriangles: true,
    requireUvs: true,
  },
  'unreal-game': {
    id: 'unreal-game',
    label: 'Unreal Game',
    target: 'unreal',
    maxTriangles: 120000,
    lodRatios: [1, 0.5, 0.25],
    recomputeNormals: true,
    dropDegenerateTriangles: true,
    requireUvs: true,
  },
}

export function productionProfile(id: ProductionProfileId): ProductionProfile {
  return PRODUCTION_PROFILES[id]
}
