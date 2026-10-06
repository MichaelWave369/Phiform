export interface BridgeBackend {
  id: string
  label: string
  kind: 'proof' | 'neural'
  available: boolean
  model?: string
  license?: string
  capabilities: {
    textTo3D: boolean
    imageTo3D: boolean
    multiView: boolean
    glbOutput: boolean
  }
}

export interface BridgeHealth {
  schema: 'phiform.bridge.health.v1'
  status: 'ok'
  bridgeVersion: string
}

export interface BridgeArtifact {
  url: string
  format: 'glb'
  mimeType: 'model/gltf-binary'
  sha256?: string
  byteLength?: number
}

export interface BridgeJob {
  schema: 'phiform.bridge.job.v1'
  id: string
  backendId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  seed: number
  createdAt: string
  artifact?: BridgeArtifact
  notes?: string[]
  error?: string
}
