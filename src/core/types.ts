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

export interface MeshTarget {
  id: string
  name: string
  vertices: number
  triangles: number
}

export type EditTarget =
  | { kind: 'artifact' }
  | { kind: 'mesh'; mesh: MeshTarget }

export type EditNodeKind =
  | 'source'
  | 'workspace-snapshot'
  | 'neural-intent'
  | 'derived-export'

export type EditExecution =
  | 'source'
  | 'manual'
  | 'recorded-only'
  | 'exported'

export interface DerivedArtifactLineage {
  id: string
  label: string
  format: 'glb'
  sha256: string
  byteLength: number
  createdAt: string
}

export interface EditGraphNode {
  id: string
  parentIds: string[]
  branch: string
  kind: EditNodeKind
  label: string
  createdAt: string
  sourceArtifactId: string
  edits: WorkspaceEditState
  target: EditTarget
  instruction?: string
  execution: EditExecution
  derivedArtifact?: DerivedArtifactLineage
}

export interface EditReceipt {
  schema: 'phiform.edit-receipt.v1'
  id: string
  nodeId: string
  parentNodeIds: string[]
  branch: string
  operation: EditNodeKind
  createdAt: string
  sourceArtifactId: string
  target: EditTarget
  instruction?: string
  execution: EditExecution
  derivedArtifact?: DerivedArtifactLineage
  notes: string[]
}

export interface EditGraph {
  schema: 'phiform.edit-graph.v1'
  rootNodeId: string
  currentNodeId: string
  currentBranch: string
  branches: Record<string, string>
  nodes: Record<string, EditGraphNode>
  receipts: EditReceipt[]
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

export interface PortableProjectV1 {
  schema: 'phiform.project.v1'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}

export interface PortableProject {
  schema: 'phiform.project.v2'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  editGraph: EditGraph
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}
