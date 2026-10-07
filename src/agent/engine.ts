import {
  checkoutNode,
  commitWorkspaceSnapshot,
  createBranch,
  currentGraphNode,
  recordNeuralEditIntent,
} from '../core/editGraph'
import type {
  EditTarget,
  Vec3Tuple,
  WorkspaceEditState,
} from '../core/types'
import type {
  AgentCapability,
  AgentCommand,
  AgentCommandName,
  AgentExecutionResult,
  AgentReceipt,
  AgentStateFingerprint,
  AgentWorkspaceState,
} from './types'

export const AGENT_COMMAND_CAPABILITY: Record<AgentCommandName, AgentCapability> = {
  'workspace.read': 'workspace.read',
  'workspace.transform.set': 'workspace.transform',
  'workspace.material.set': 'workspace.material',
  'target.artifact': 'target.write',
  'graph.commit': 'graph.write',
  'graph.branch': 'graph.write',
  'graph.checkout': 'graph.write',
  'neural.intent.record': 'neural.intent',
  'artifact.export.glb': 'artifact.export',
}

export const AGENT_CAPABILITIES: AgentCapability[] = [
  'workspace.read',
  'workspace.transform',
  'workspace.material',
  'target.write',
  'graph.write',
  'neural.intent',
  'artifact.export',
]

function cloneTarget(target: EditTarget): EditTarget {
  return target.kind === 'mesh'
    ? { kind: 'mesh', mesh: { ...target.mesh } }
    : { kind: 'artifact' }
}

function fingerprint(state: AgentWorkspaceState): AgentStateFingerprint {
  return {
    artifactId: state.artifact.id,
    nodeId: state.editGraph.currentNodeId,
    branch: state.editGraph.currentBranch,
    revision: state.edits.revision,
    target: state.target.kind === 'mesh'
      ? state.target.mesh.id
      : 'artifact',
  }
}

function receiptId(commandId: string): string {
  return `agent-receipt-${commandId}`
}

function finiteTuple(value: unknown, label: string): Vec3Tuple {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    throw new Error(`${label} must be a finite [x, y, z] tuple.`)
  }
  return [value[0], value[1], value[2]]
}

function validateColor(value: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(value)) {
    throw new Error('Material color must be #RRGGBB.')
  }
  return value.toLowerCase()
}

function unitValue(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} must be between 0 and 1.`)
  }
  return value
}

function degreesToRadians(value: Vec3Tuple): Vec3Tuple {
  return value.map((item) => (item * Math.PI) / 180) as Vec3Tuple
}

function cloneEdits(edits: WorkspaceEditState): WorkspaceEditState {
  return {
    position: [...edits.position],
    rotation: [...edits.rotation],
    scale: [...edits.scale],
    material: { ...edits.material },
    revision: edits.revision,
  }
}

function reject(
  command: AgentCommand,
  capability: AgentCapability,
  state: AgentWorkspaceState,
  reason: string,
  createdAt: string,
): AgentExecutionResult {
  const stateFingerprint = fingerprint(state)
  const receipt: AgentReceipt = {
    schema: 'phiform.agent-receipt.v1',
    id: receiptId(command.id),
    commandId: command.id,
    agentId: command.agentId,
    command: command.command,
    capability,
    status: 'rejected',
    createdAt,
    before: stateFingerprint,
    after: stateFingerprint,
    reason,
    effects: [],
  }
  return { state, receipt, effects: [] }
}

function ensureExpectedState(
  command: AgentCommand,
  state: AgentWorkspaceState,
): string | undefined {
  const expected = command.expected
  if (!expected) return undefined

  if (expected.artifactId !== undefined && expected.artifactId !== state.artifact.id) {
    return `stale artifact: expected ${expected.artifactId}, current ${state.artifact.id}`
  }
  if (expected.nodeId !== undefined && expected.nodeId !== state.editGraph.currentNodeId) {
    return `stale graph node: expected ${expected.nodeId}, current ${state.editGraph.currentNodeId}`
  }
  if (expected.revision !== undefined && expected.revision !== state.edits.revision) {
    return `stale workspace revision: expected ${expected.revision}, current ${state.edits.revision}`
  }
  return undefined
}

function validateEnvelope(value: unknown): asserts value is AgentCommand {
  if (!value || typeof value !== 'object') {
    throw new Error('Agent command must be an object.')
  }

  const candidate = value as Record<string, unknown>
  if (candidate.schema !== 'phiform.agent-command.v1') {
    throw new Error('Unsupported agent command schema.')
  }
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) {
    throw new Error('Agent command requires a non-empty id.')
  }
  if (typeof candidate.agentId !== 'string' || !candidate.agentId.trim()) {
    throw new Error('Agent command requires a non-empty agentId.')
  }
  if (
    typeof candidate.command !== 'string' ||
    !(candidate.command in AGENT_COMMAND_CAPABILITY)
  ) {
    throw new Error('Unknown agent command.')
  }
  if (!candidate.args || typeof candidate.args !== 'object' || Array.isArray(candidate.args)) {
    throw new Error('Agent command args must be an object.')
  }
}

export function parseAgentCommand(value: unknown): AgentCommand {
  validateEnvelope(value)
  return value
}

export function executeAgentCommand(
  currentState: AgentWorkspaceState,
  command: AgentCommand,
  grantedCapabilities: ReadonlySet<AgentCapability>,
  priorReceipts: readonly AgentReceipt[] = [],
  createdAt = new Date().toISOString(),
): AgentExecutionResult {
  const capability = AGENT_COMMAND_CAPABILITY[command.command]

  if (priorReceipts.some((receipt) => receipt.commandId === command.id)) {
    return reject(
      command,
      capability,
      currentState,
      `replay rejected: command id ${command.id} already has a receipt`,
      createdAt,
    )
  }

  if (!grantedCapabilities.has(capability)) {
    return reject(
      command,
      capability,
      currentState,
      `capability not granted: ${capability}`,
      createdAt,
    )
  }

  const staleReason = ensureExpectedState(command, currentState)
  if (staleReason) {
    return reject(command, capability, currentState, staleReason, createdAt)
  }

  const before = fingerprint(currentState)
  let state: AgentWorkspaceState = {
    artifact: currentState.artifact,
    edits: cloneEdits(currentState.edits),
    editGraph: currentState.editGraph,
    target: cloneTarget(currentState.target),
  }
  const effects: AgentExecutionResult['effects'] = []
  let result: Record<string, unknown> | undefined

  try {
    switch (command.command) {
      case 'workspace.read': {
        result = {
          artifactId: state.artifact.id,
          artifactKind: state.artifact.kind,
          nodeId: state.editGraph.currentNodeId,
          branch: state.editGraph.currentBranch,
          revision: state.edits.revision,
          target: state.target,
          edits: state.edits,
        }
        break
      }

      case 'workspace.transform.set': {
        const next = cloneEdits(state.edits)
        if (command.args.position !== undefined) {
          next.position = finiteTuple(command.args.position, 'position')
        }
        if (command.args.rotationDegrees !== undefined) {
          next.rotation = degreesToRadians(
            finiteTuple(command.args.rotationDegrees, 'rotationDegrees'),
          )
        }
        if (command.args.scale !== undefined) {
          const scale = finiteTuple(command.args.scale, 'scale')
          if (scale.some((item) => item <= 0)) {
            throw new Error('Scale values must be greater than zero.')
          }
          next.scale = scale
        }
        next.revision += 1
        state = { ...state, edits: next }
        result = { revision: next.revision }
        break
      }

      case 'workspace.material.set': {
        const next = cloneEdits(state.edits)
        if (command.args.enabled !== undefined) {
          if (typeof command.args.enabled !== 'boolean') {
            throw new Error('Material enabled must be boolean.')
          }
          next.material.enabled = command.args.enabled
        }
        if (command.args.color !== undefined) {
          next.material.color = validateColor(command.args.color)
        }
        if (command.args.metalness !== undefined) {
          next.material.metalness = unitValue(command.args.metalness, 'metalness')
        }
        if (command.args.roughness !== undefined) {
          next.material.roughness = unitValue(command.args.roughness, 'roughness')
        }
        next.revision += 1
        state = { ...state, edits: next }
        result = { revision: next.revision, material: next.material }
        break
      }

      case 'target.artifact': {
        state = { ...state, target: { kind: 'artifact' } }
        result = { target: 'artifact' }
        break
      }

      case 'graph.commit': {
        const graph = commitWorkspaceSnapshot(
          state.editGraph,
          state.artifact,
          state.edits,
          command.args.label ?? '',
          state.target,
        )
        state = { ...state, editGraph: graph }
        result = { nodeId: graph.currentNodeId, branch: graph.currentBranch }
        break
      }

      case 'graph.branch': {
        const graph = createBranch(state.editGraph, command.args.name)
        state = { ...state, editGraph: graph }
        result = { branch: graph.currentBranch, nodeId: graph.currentNodeId }
        break
      }

      case 'graph.checkout': {
        const graph = checkoutNode(state.editGraph, command.args.nodeId)
        const node = currentGraphNode(graph)
        state = {
          ...state,
          editGraph: graph,
          edits: cloneEdits(node.edits),
          target: cloneTarget(node.target),
        }
        result = {
          branch: graph.currentBranch,
          nodeId: graph.currentNodeId,
          revision: node.edits.revision,
        }
        break
      }

      case 'neural.intent.record': {
        const instruction = command.args.instruction.trim()
        if (!instruction) throw new Error('Neural intent instruction is empty.')
        const target = command.args.scope === 'artifact'
          ? { kind: 'artifact' } as const
          : state.target
        const graph = recordNeuralEditIntent(
          state.editGraph,
          state.artifact,
          state.edits,
          instruction,
          target,
        )
        state = { ...state, editGraph: graph, target: cloneTarget(target) }
        result = {
          nodeId: graph.currentNodeId,
          execution: 'recorded-only',
          target,
        }
        break
      }

      case 'artifact.export.glb': {
        effects.push({
          kind: 'export-glb',
          filename: command.args.filename?.trim() || undefined,
        })
        result = { effect: 'export-glb' }
        break
      }
    }
  } catch (error) {
    return reject(
      command,
      capability,
      currentState,
      error instanceof Error ? error.message : 'command execution failed',
      createdAt,
    )
  }

  const receipt: AgentReceipt = {
    schema: 'phiform.agent-receipt.v1',
    id: receiptId(command.id),
    commandId: command.id,
    agentId: command.agentId,
    command: command.command,
    capability,
    status: 'executed',
    createdAt,
    before,
    after: fingerprint(state),
    result,
    effects,
  }

  return { state, receipt, effects }
}
