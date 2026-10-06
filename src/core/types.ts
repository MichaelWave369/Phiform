export type PrimitiveKind = 'cube' | 'sphere' | 'torus' | 'icosahedron' | 'capsule'
export type TransformMode = 'translate' | 'rotate' | 'scale'
export type Vec3Tuple = [number, number, number]

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
  scale: Vec3Tuple
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

export interface WorkspaceMaterialOverride {
  enabled: boolean
  color: string
  metalness: number
  roughness: number
}

export interface WorkspaceEditState {
  position: Vec3Tuple
  rotation: Vec3Tuple
  scale: Vec3Tuple
  material: WorkspaceMaterialOverride
  revision: number
}

export interface MeshStats {
  meshes: number
  vertices: number
  triangles: number
  materials: number
  bounds: Vec3Tuple
}

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
  seedKind?: 'request-fingerprint' | 'inference'
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

export interface PortableProject {
  schema: 'phiform.project.v1'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}
