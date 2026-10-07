import type { EngineTarget, ProductionProfileId } from '../core/types'

export interface EngineRuntimeLodFile {
  lod: number
  ratio: number
  triangles: number
  blob: Blob
}

export interface EngineRuntimeResult {
  engine: EngineTarget
  productionProfileId: ProductionProfileId
  collisionNodeNames: string[]
  importSceneBlob: Blob
  lodFiles: EngineRuntimeLodFile[]
}
