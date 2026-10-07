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

export type PortableProject = PortableProjectV8


export interface AgentAuditFingerprint {
  artifactId: string
  nodeId: string
  branch: string
  revision: number
  target: string
}

export interface AgentAuditReceipt {
  schema: 'phiform.agent-receipt.v1'
  id: string
  commandId: string
  agentId: string
  command: string
  capability: string
  status: 'executed' | 'dispatched' | 'rejected'
  createdAt: string
  before: AgentAuditFingerprint
  after: AgentAuditFingerprint
  reason?: string
  result?: Record<string, unknown>
  effects: Array<{ kind: 'export-glb'; filename?: string }>
}

export interface PortableProjectV2 {
  schema: 'phiform.project.v2'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  editGraph: EditGraph
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}

export interface PortableProjectV3 {
  schema: 'phiform.project.v3'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  editGraph: EditGraph
  agentReceipts: AgentAuditReceipt[]
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}


export type ProductionProfileId =
  | 'archive-glb'
  | 'web-balanced'
  | 'godot-game'
  | 'unreal-game'

export interface GeometryAudit {
  meshId: string
  name: string
  vertices: number
  triangles: number
  indexed: boolean
  normalsPresent: boolean
  normalsFinite: boolean
  uvsPresent: boolean
  uvsFinite: boolean
  invalidVertices: number
  degenerateTriangles: number
  boundaryEdges: number
  nonManifoldEdges: number
}

export interface ProductionAudit {
  meshes: GeometryAudit[]
  totals: {
    meshes: number
    vertices: number
    triangles: number
    invalidVertices: number
    degenerateTriangles: number
    boundaryEdges: number
    nonManifoldEdges: number
    meshesMissingNormals: number
    meshesMissingUvs: number
  }
  qualification: 'pass' | 'warning' | 'fail'
  notes: string[]
}

export interface ProductionArtifactFile {
  label: string
  filename: string
  lod: number
  ratio: number
  triangles: number
  byteLength: number
  sha256: string
}

export interface ProductionReceipt {
  schema: 'phiform.production-receipt.v1'
  id: string
  createdAt: string
  sourceArtifactId: string
  sourceNodeId: string
  profileId: ProductionProfileId
  qualification: 'pass' | 'warning' | 'fail'
  before: ProductionAudit
  after: ProductionAudit[]
  operations: string[]
  files: ProductionArtifactFile[]
}

export interface PortableProjectV4 {
  schema: 'phiform.project.v4'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  editGraph: EditGraph
  agentReceipts: AgentAuditReceipt[]
  productionReceipts: ProductionReceipt[]
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}


export type EngineTarget = 'godot' | 'unreal'
export type CollisionProxyKind = 'box'

export interface EnginePackFile {
  path: string
  role: 'import-scene' | 'lod' | 'manifest' | 'instructions'
  byteLength: number
  sha256: string
}

export interface EnginePackManifest {
  schema: 'phiform.engine-pack.v1'
  createdAt: string
  engine: EngineTarget
  sourceArtifactId: string
  sourceNodeId: string
  productionProfileId: ProductionProfileId
  coordinates: {
    standard: 'glTF 2.0'
    handedness: 'right'
    upAxis: '+Y'
    forwardAxis: '+Z'
    linearUnit: 'meter'
  }
  collision: {
    kind: CollisionProxyKind
    nodeNames: string[]
    embeddedInImportScene: true
  }
  lods: Array<{
    lod: number
    path: string
    ratio: number
    triangles: number
    sha256: string
  }>
  importScenePath: string
  notes: string[]
}

export interface EnginePackReceipt {
  schema: 'phiform.engine-pack-receipt.v1'
  id: string
  createdAt: string
  engine: EngineTarget
  sourceArtifactId: string
  sourceNodeId: string
  manifest: EnginePackManifest
  files: EnginePackFile[]
  packageFilename: string
  packageByteLength: number
  packageSha256: string
}

export interface PortableProjectV5 {
  schema: 'phiform.project.v5'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  editGraph: EditGraph
  agentReceipts: AgentAuditReceipt[]
  productionReceipts: ProductionReceipt[]
  enginePackReceipts: EnginePackReceipt[]
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}


export type TextureProfileId =
  | 'archive-textures'
  | 'web-textures'
  | 'game-textures'

export type TextureRole =
  | 'base-color'
  | 'emissive'
  | 'normal'
  | 'roughness'
  | 'metalness'
  | 'occlusion'
  | 'alpha'
  | 'bump'
  | 'displacement'
  | 'light'
  | 'unknown'

export type TextureColorExpectation = 'srgb' | 'linear'

export interface TextureAuditEntry {
  id: string
  name: string
  roles: TextureRole[]
  width: number
  height: number
  maxDimension: number
  powerOfTwo: boolean
  colorSpace: string
  expectedColorSpaces: TextureColorExpectation[]
  colorSpaceMatch: boolean
  channel: number
  estimatedGpuBytes: number
  overDimensionBudget: boolean
}

export interface MaterialAuditEntry {
  id: string
  name: string
  type: string
  textureIds: string[]
  packedOrmTextureId?: string
  issues: string[]
}

export interface TextureAudit {
  profileId: TextureProfileId
  textures: TextureAuditEntry[]
  materials: MaterialAuditEntry[]
  totals: {
    textures: number
    materials: number
    uniquePixels: number
    estimatedGpuBytes: number
    oversizedTextures: number
    colorSpaceMismatches: number
    materialsWithoutTextures: number
    packedOrmMaterials: number
  }
  qualification: 'pass' | 'warning' | 'fail'
  notes: string[]
}

export interface TextureCompressionPlanEntry {
  textureId: string
  roles: TextureRole[]
  target: 'ktx2-basisu'
  mode: 'etc1s' | 'uastc'
  status: 'planned-not-executed'
  reason: string
}

export interface TextureReceipt {
  schema: 'phiform.texture-receipt.v1'
  id: string
  createdAt: string
  sourceArtifactId: string
  sourceNodeId: string
  profileId: TextureProfileId
  audit: TextureAudit
  compressionPlan: TextureCompressionPlanEntry[]
  compressionExecuted: false
  notes: string[]
}

export interface PortableProjectV6 {
  schema: 'phiform.project.v6'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  editGraph: EditGraph
  agentReceipts: AgentAuditReceipt[]
  productionReceipts: ProductionReceipt[]
  enginePackReceipts: EnginePackReceipt[]
  textureReceipts: TextureReceipt[]
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}


export type TextureEncoderCodec = 'basis-lz' | 'uastc-ldr-4x4'

export interface TextureEncoderDescriptor {
  schema: 'phiform.texture-encoder.v1'
  id: 'khronos.ktx.v1'
  label: string
  available: boolean
  executable: string
  version?: string
  codecs: TextureEncoderCodec[]
  statusReason?: string
}

export interface TextureEncodeArtifact {
  textureId: string
  name: string
  roles: TextureRole[]
  codec: TextureEncoderCodec
  sourcePngSha256: string
  sourcePngByteLength: number
  outputSha256: string
  outputByteLength: number
  outputFilename: string
  outputUrl?: string
  compressionRatio: number
  browserHashVerified: true
}

export interface TextureEncodingReceipt {
  schema: 'phiform.texture-encode-receipt.v1'
  id: string
  createdAt: string
  sourceArtifactId: string
  sourceNodeId: string
  profileId: TextureProfileId
  encoderId: 'khronos.ktx.v1'
  encoderVersion: string
  compressionExecuted: true
  allOutputsValidated: true
  totalSourcePngBytes: number
  totalOutputBytes: number
  aggregateCompressionRatio: number
  artifacts: TextureEncodeArtifact[]
  notes: string[]
}

export interface PortableProjectV7 {
  schema: 'phiform.project.v7'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  editGraph: EditGraph
  agentReceipts: AgentAuditReceipt[]
  productionReceipts: ProductionReceipt[]
  enginePackReceipts: EnginePackReceipt[]
  textureReceipts: TextureReceipt[]
  textureEncodingReceipts: TextureEncodingReceipt[]
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}


export interface BasisuTextureBinding {
  textureId: string
  textureName: string
  gltfTextureIndex: number
  fallbackImageIndex: number
  ktx2ImageIndex: number
  ktx2Sha256: string
  ktx2ByteLength: number
}

export interface BasisuDerivedReceipt {
  schema: 'phiform.basisu-derived-receipt.v1'
  id: string
  createdAt: string
  sourceArtifactId: string
  sourceNodeId: string
  sourceEncodingReceiptId: string
  outputFilename: string
  sourceGlbSha256: string
  sourceGlbByteLength: number
  outputGlbSha256: string
  outputGlbByteLength: number
  extensionUsed: 'KHR_texture_basisu'
  extensionRequired: false
  boundTextureCount: number
  fallbackOnlyTextureCount: number
  bindings: BasisuTextureBinding[]
  fallbackOnlyTextureNames: string[]
  notes: string[]
}

export interface PortableProjectV8 {
  schema: 'phiform.project.v8'
  savedAt: string
  artifact: ModelArtifact
  edits: WorkspaceEditState
  editGraph: EditGraph
  agentReceipts: AgentAuditReceipt[]
  productionReceipts: ProductionReceipt[]
  enginePackReceipts: EnginePackReceipt[]
  textureReceipts: TextureReceipt[]
  textureEncodingReceipts: TextureEncodingReceipt[]
  basisuDerivedReceipts: BasisuDerivedReceipt[]
  latestReceipt?: GenerationReceipt
  glbBase64?: string
}
