import type { GenerationRequest, GenerationResult } from '../core/types'

export interface AdapterCapabilities {
  textTo3D: boolean
  imageTo3D: boolean
  multiView: boolean
  localInference: boolean
  editableMeshOutput: boolean
}

export interface Neural3DAdapter {
  readonly id: string
  readonly label: string
  readonly capabilities: AdapterCapabilities
  generate(request: GenerationRequest): Promise<GenerationResult>
}
