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

export interface ModelArtifact {
  id: string
  label: string
  primitive: PrimitiveKind
  seed: number
  scale: [number, number, number]
  material: {
    metalness: number
    roughness: number
  }
  createdAt: string
}

export interface GenerationReceipt {
  schema: 'phiform.receipt.v1'
  id: string
  adapterId: string
  adapterLabel: string
  createdAt: string
  request: GenerationRequest
  outputArtifactId: string
  seed: number
  status: 'success'
  notes: string[]
}

export interface GenerationResult {
  artifact: ModelArtifact
  receipt: GenerationReceipt
}
