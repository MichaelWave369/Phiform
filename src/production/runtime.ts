import type {
  ProductionAudit,
  ProductionProfileId,
} from '../core/types'

export interface ProductionRuntimeFile {
  lod: number
  ratio: number
  audit: ProductionAudit
  operations: string[]
  blob: Blob
}

export interface ProductionRuntimeResult {
  profileId: ProductionProfileId
  before: ProductionAudit
  operations: string[]
  files: ProductionRuntimeFile[]
}
