import type {
  AgentAuditReceipt,
  EditGraph,
  EditTarget,
  MeshTarget,
  ModelArtifact,
  Vec3Tuple,
  WorkspaceEditState,
} from '../core/types'

export type AgentCapability =
  | 'workspace.read'
  | 'workspace.transform'
  | 'workspace.material'
  | 'target.write'
  | 'graph.write'
  | 'neural.intent'
  | 'artifact.export'

export type AgentCommandName =
  | 'workspace.read'
  | 'workspace.transform.set'
  | 'workspace.material.set'
  | 'target.artifact'
  | 'target.mesh'
  | 'graph.commit'
  | 'graph.branch'
  | 'graph.checkout'
  | 'neural.intent.record'
  | 'artifact.export.glb'

export interface AgentExpectedState {
  artifactId?: string
  nodeId?: string
  revision?: number
}

interface AgentCommandBase<Name extends AgentCommandName, Args> {
  schema: 'phiform.agent-command.v1'
  id: string
  agentId: string
  command: Name
  args: Args
  expected?: AgentExpectedState
}

export type AgentCommand =
  | AgentCommandBase<'workspace.read', Record<string, never>>
  | AgentCommandBase<
      'workspace.transform.set',
      {
        position?: Vec3Tuple
        rotationDegrees?: Vec3Tuple
        scale?: Vec3Tuple
      }
    >
  | AgentCommandBase<
      'workspace.material.set',
      {
        enabled?: boolean
        color?: string
        metalness?: number
        roughness?: number
      }
    >
  | AgentCommandBase<'target.artifact', Record<string, never>>
  | AgentCommandBase<'target.mesh', { id: string }>
  | AgentCommandBase<'graph.commit', { label?: string }>
  | AgentCommandBase<'graph.branch', { name: string }>
  | AgentCommandBase<'graph.checkout', { nodeId: string }>
  | AgentCommandBase<
      'neural.intent.record',
      {
        instruction: string
        scope?: 'current' | 'artifact'
      }
    >
  | AgentCommandBase<'artifact.export.glb', { filename?: string }>

export interface AgentWorkspaceState {
  artifact: ModelArtifact
  edits: WorkspaceEditState
  editGraph: EditGraph
  target: EditTarget
  meshTargets: MeshTarget[]
}

export interface AgentStateFingerprint {
  artifactId: string
  nodeId: string
  branch: string
  revision: number
  target: 'artifact' | string
}

export interface AgentEffect {
  kind: 'export-glb'
  filename?: string
}

export interface AgentReceipt extends AgentAuditReceipt {
  command: AgentCommandName
  capability: AgentCapability
  status: 'executed' | 'dispatched' | 'rejected'
  before: AgentStateFingerprint
  after: AgentStateFingerprint
  effects: AgentEffect[]
}

export interface AgentExecutionResult {
  state: AgentWorkspaceState
  receipt: AgentReceipt
  effects: AgentEffect[]
}
