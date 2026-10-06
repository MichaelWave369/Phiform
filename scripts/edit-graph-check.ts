import assert from 'node:assert/strict'
import {
  checkoutNode,
  commitWorkspaceSnapshot,
  createBranch,
  createEditGraph,
  currentGraphNode,
  isWorkspaceDirty,
  recordDerivedExport,
  recordNeuralEditIntent,
} from '../src/core/editGraph'
import type { ModelArtifact } from '../src/core/types'
import { defaultWorkspaceEdits } from '../src/core/workspace'

const artifact: ModelArtifact = {
  kind: 'primitive',
  id: 'artifact-contract',
  label: 'Graph Contract Form',
  primitive: 'cube',
  seed: 369,
  scale: [1, 1, 1],
  material: { metalness: 0.2, roughness: 0.6 },
  createdAt: '2026-10-06T00:00:00.000Z',
}

const sourceEdits = defaultWorkspaceEdits()
let graph = createEditGraph(artifact, sourceEdits)

assert.equal(graph.schema, 'phiform.edit-graph.v1')
assert.equal(graph.currentBranch, 'main')
assert.equal(Object.keys(graph.nodes).length, 1)
assert.equal(graph.receipts[0]?.operation, 'source')
assert.equal(isWorkspaceDirty(graph, sourceEdits), false)

const edited = defaultWorkspaceEdits()
edited.position = [1.25, 0, 0]
edited.revision = 1
assert.equal(isWorkspaceDirty(graph, edited), true)

graph = commitWorkspaceSnapshot(
  graph,
  artifact,
  edited,
  'move body right',
  { kind: 'artifact' },
)

const snapshotId = graph.currentNodeId
const snapshot = currentGraphNode(graph)
assert.equal(snapshot.kind, 'workspace-snapshot')
assert.equal(snapshot.parentIds.length, 1)
assert.equal(snapshot.edits.position[0], 1.25)
assert.equal(isWorkspaceDirty(graph, edited), false)

graph = createBranch(graph, 'Handle Variant')
assert.equal(graph.currentBranch, 'handle-variant')
assert.equal(graph.branches['handle-variant'], snapshotId)

graph = recordNeuralEditIntent(
  graph,
  artifact,
  edited,
  'make this handle brushed brass and slightly thicker',
  {
    kind: 'mesh',
    mesh: {
      id: 'mesh-003',
      name: 'Handle',
      vertices: 128,
      triangles: 240,
    },
  },
)

const intentId = graph.currentNodeId
const intent = currentGraphNode(graph)
assert.equal(intent.kind, 'neural-intent')
assert.equal(intent.execution, 'recorded-only')
assert.equal(intent.parentIds[0], snapshotId)
assert.equal(intent.target.kind, 'mesh')
assert.ok(
  graph.receipts.at(-1)?.notes.some((note) =>
    note.includes('No localized neural edit backend executed'),
  ),
)

graph = checkoutNode(graph, snapshotId)
assert.equal(graph.currentNodeId, snapshotId)
assert.equal(currentGraphNode(graph).kind, 'workspace-snapshot')

graph = recordDerivedExport(graph, artifact, edited, {
  id: 'derived-contract',
  label: 'graph-contract-edited.glb',
  format: 'glb',
  sha256: 'a'.repeat(64),
  byteLength: 4096,
  createdAt: '2026-10-06T00:01:00.000Z',
})

const derived = currentGraphNode(graph)
assert.equal(derived.kind, 'derived-export')
assert.equal(derived.parentIds[0], snapshotId)
assert.equal(derived.derivedArtifact?.sha256, 'a'.repeat(64))
assert.equal(graph.branches[graph.currentBranch], derived.id)
assert.ok(graph.nodes[intentId])

process.stdout.write(
  [
    `PASS source node: ${graph.rootNodeId}`,
    `PASS branch lineage retained: ${intentId}`,
    `PASS derived export receipt: ${derived.id}`,
    `PASS edit receipts: ${graph.receipts.length}`,
  ].join('\n') + '\n',
)
