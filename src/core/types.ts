export type PrimitiveKind = 'cube' | 'sphere' | 'torus' | 'icosahedron' | 'capsule'

export interface ImageSource {
  name: string
  type: string
  size: number
}

export interface GenerationRequest {
  prompt: string
  image?: ImageSource
}

export interface GenerationRuntimeInputs {
  imageFile?: File
}

interface BaseArtifact {
  id: string
  label: string
  seed: number
  createdAt: string
}

export interface PrimitiveModelArtifact extends BaseArtifact {
  kind: 'primitive'
  primitive: PrimitiveKind
  scale: [number, number, number]
  material: {
    metalness: number
    roughness: number
  }
}

export interface GlbModelArtifact extends BaseArtifact {
  kind: 'glb'
  format: 'glb'
  url: string
  backendId: string
  sha256?: string
  byteLength?: number
}

export type ModelArtifact = PrimitiveModelArtifact | GlbModelArtifact

export interface GenerationReceipt {
  schema: 'phiform.receipt.v1'
  id: string
  adapterId: string
  adapterLabel: string
  backendId?: string
  jobId?: string
  createdAt: string
  request: GenerationRequest
  outputArtifactId: string
  seed: number
  status: 'success'
  output?: {
    format: 'procedural' | 'glb'
    sha256?: string
    byteLength?: number
  }
  notes: string[]
}

export interface GenerationResult {
  artifact: ModelArtifact
  receipt: GenerationReceipt
}
