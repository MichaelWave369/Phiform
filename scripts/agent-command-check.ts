import assert from 'node:assert/strict'
import { executeAgentCommand } from '../src/agent/engine'
import type {
  AgentCapability,
  AgentCommand,
  AgentReceipt,
  AgentWorkspaceState,
} from '../src/agent/types'
import { createEditGraph } from '../src/core/editGraph'
import type { ModelArtifact } from '../src/core/types'
import { defaultWorkspaceEdits } from '../src/core/workspace'

const artifact: ModelArtifact = {
  kind: 'primitive',
  id: 'artifact-agent-contract',
  label: 'Agent Contract Form',
  primitive: 'cube',
  seed: 369,
  scale: [1, 1, 1],
  material: { metalness: 0.2, roughness: 0.6 },
  createdAt: '2026-10-06T00:00:00.000Z',
}

const edits = defaultWorkspaceEdits()
let state: AgentWorkspaceState = {
  artifact,
  edits,
  editGraph: createEditGraph(artifact, edits),
  target: { kind: 'artifact' },
  meshTargets: [
    { id: 'mesh-000', name: 'Body', vertices: 24, triangles: 12 },
    { id: 'mesh-001', name: 'Handle', vertices: 128, triangles: 240 },
  ],
}

let receipts: AgentReceipt[] = []
const readOnly = new Set<AgentCapability>(['workspace.read'])
const all = new Set<AgentCapability>([
  'workspace.read',
  'workspace.transform',
  'workspace.material',
  'target.write',
  'graph.write',
  'neural.intent',
  'artifact.export',
])

function run(
  command: AgentCommand,
  grants = all,
  createdAt = '2026-10-06T00:01:00.000Z',
) {
  const result = executeAgentCommand(
    state,
    command,
    grants,
    receipts,
    createdAt,
  )
  receipts = [...receipts, result.receipt]
  if (result.receipt.status !== 'rejected') {
    state = result.state
  }
  return result
}

const readCommand: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-read-1',
  agentId: 'contract-agent',
  command: 'workspace.read',
  args: {},
}
const read = run(readCommand, readOnly)
assert.equal(read.receipt.status, 'executed')
assert.equal(read.receipt.capability, 'workspace.read')
assert.equal(read.receipt.result?.artifactId, artifact.id)
assert.equal(
  Array.isArray(read.receipt.result?.meshTargets),
  true,
)

const forbiddenTransform: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-forbidden-transform',
  agentId: 'contract-agent',
  command: 'workspace.transform.set',
  args: { position: [1, 0, 0] },
}
const forbidden = run(forbiddenTransform, readOnly)
assert.equal(forbidden.receipt.status, 'rejected')
assert.match(forbidden.receipt.reason ?? '', /capability not granted/)
assert.deepEqual(state.edits.position, [0, 0, 0])

const transform: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-transform-1',
  agentId: 'contract-agent',
  command: 'workspace.transform.set',
  args: {
    position: [1.25, 0, -0.5],
    rotationDegrees: [0, 45, 0],
    scale: [1.1, 1.1, 1.1],
  },
  expected: {
    artifactId: state.artifact.id,
    nodeId: state.editGraph.currentNodeId,
    revision: state.edits.revision,
  },
}
const transformed = run(transform)
assert.equal(transformed.receipt.status, 'executed')
assert.deepEqual(state.edits.position, [1.25, 0, -0.5])
assert.equal(state.edits.revision, 1)

const stale: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-stale-1',
  agentId: 'contract-agent',
  command: 'workspace.material.set',
  args: { enabled: true, color: '#112233' },
  expected: { revision: 0 },
}
const staleResult = run(stale)
assert.equal(staleResult.receipt.status, 'rejected')
assert.match(staleResult.receipt.reason ?? '', /stale workspace revision/)

const badMesh: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-bad-mesh',
  agentId: 'contract-agent',
  command: 'target.mesh',
  args: { id: 'mesh-999' },
}
const badTarget = run(badMesh)
assert.equal(badTarget.receipt.status, 'rejected')
assert.match(badTarget.receipt.reason ?? '', /Unknown mesh target/)

const targetMesh: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-target-handle',
  agentId: 'contract-agent',
  command: 'target.mesh',
  args: { id: 'mesh-001' },
}
const targeted = run(targetMesh)
assert.equal(targeted.receipt.status, 'executed')
assert.equal(state.target.kind, 'mesh')
assert.equal(state.target.kind === 'mesh' ? state.target.mesh.name : '', 'Handle')

const commit: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-commit-1',
  agentId: 'contract-agent',
  command: 'graph.commit',
  args: { label: 'agent positioned handle variant' },
}
const committed = run(commit)
assert.equal(committed.receipt.status, 'executed')
const committedNode = state.editGraph.currentNodeId

const branchCommand: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-branch-1',
  agentId: 'contract-agent',
  command: 'graph.branch',
  args: { name: 'Agent Variant' },
  expected: { nodeId: committedNode },
}
const branched = run(branchCommand)
assert.equal(branched.receipt.status, 'executed')
assert.equal(state.editGraph.currentBranch, 'agent-variant')

const intent: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-intent-1',
  agentId: 'contract-agent',
  command: 'neural.intent.record',
  args: {
    instruction: 'make the selected handle brushed brass and slightly thicker',
    scope: 'current',
  },
}
const intentResult = run(intent)
assert.equal(intentResult.receipt.status, 'executed')
assert.equal(intentResult.receipt.result?.execution, 'recorded-only')
assert.equal(state.editGraph.nodes[state.editGraph.currentNodeId]?.kind, 'neural-intent')

const exportCommand: AgentCommand = {
  schema: 'phiform.agent-command.v1',
  id: 'cmd-export-1',
  agentId: 'contract-agent',
  command: 'artifact.export.glb',
  args: { filename: 'agent-variant.glb' },
}
const exported = run(exportCommand)
assert.equal(exported.receipt.status, 'dispatched')
assert.deepEqual(exported.effects, [
  { kind: 'export-glb', filename: 'agent-variant.glb' },
])

const replay = executeAgentCommand(
  state,
  exportCommand,
  all,
  receipts,
  '2026-10-06T00:02:00.000Z',
)
assert.equal(replay.receipt.status, 'rejected')
assert.match(replay.receipt.reason ?? '', /replay rejected/)
assert.deepEqual(replay.effects, [])

process.stdout.write(
  [
    'PASS read-only capability gate',
    'PASS denied transform leaves state unchanged',
    'PASS optimistic revision precondition rejects stale work',
    'PASS mesh target inventory enforcement',
    'PASS branch + recorded-only neural intent',
    'PASS export dispatch semantics',
    'PASS replay protection by command id',
    `PASS agent receipts exercised: ${receipts.length + 1}`,
  ].join('\n') + '\n',
)
