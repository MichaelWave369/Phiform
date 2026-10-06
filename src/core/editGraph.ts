import type {
  DerivedArtifactLineage,
  EditGraph,
  EditGraphNode,
  EditReceipt,
  EditTarget,
  GenerationReceipt,
  ModelArtifact,
  WorkspaceEditState,
} from './types'
import { cloneWorkspaceEdits } from './workspace'

function id(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  return randomId
    ? `${prefix}-${randomId}`
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function now(): string {
  return new Date().toISOString()
}

function cloneTarget(target: EditTarget): EditTarget {
  return target.kind === 'mesh'
    ? { kind: 'mesh', mesh: { ...target.mesh } }
    : { kind: 'artifact' }
}

function addNode(
  graph: EditGraph,
  node: EditGraphNode,
  receipt: EditReceipt,
): EditGraph {
  return {
    ...graph,
    currentNodeId: node.id,
    branches: {
      ...graph.branches,
      [graph.currentBranch]: node.id,
    },
    nodes: {
      ...graph.nodes,
      [node.id]: node,
    },
    receipts: [...graph.receipts, receipt],
  }
}

function makeReceipt(
  node: EditGraphNode,
  notes: string[],
): EditReceipt {
  return {
    schema: 'phiform.edit-receipt.v1',
    id: id('edit-receipt'),
    nodeId: node.id,
    parentNodeIds: [...node.parentIds],
    branch: node.branch,
    operation: node.kind,
    createdAt: node.createdAt,
    sourceArtifactId: node.sourceArtifactId,
    target: cloneTarget(node.target),
    instruction: node.instruction,
    execution: node.execution,
    derivedArtifact: node.derivedArtifact
      ? { ...node.derivedArtifact }
      : undefined,
    notes,
  }
}

export function createEditGraph(
  artifact: ModelArtifact,
  edits: WorkspaceEditState,
  generationReceipt?: GenerationReceipt,
): EditGraph {
  const createdAt = now()
  const nodeId = id('edit-node')
  const root: EditGraphNode = {
    id: nodeId,
    parentIds: [],
    branch: 'main',
    kind: 'source',
    label: 'Source artifact',
    createdAt,
    sourceArtifactId: artifact.id,
    edits: cloneWorkspaceEdits(edits),
    target: { kind: 'artifact' },
    execution: 'source',
  }

  const receipt = makeReceipt(root, [
    'Edit graph initialized from the source artifact.',
    generationReceipt
      ? `Source generation receipt: ${generationReceipt.id}`
      : 'No generation receipt was attached to the source artifact.',
    'Source provenance remains separate from later workspace edits.',
  ])

  return {
    schema: 'phiform.edit-graph.v1',
    rootNodeId: nodeId,
    currentNodeId: nodeId,
    currentBranch: 'main',
    branches: { main: nodeId },
    nodes: { [nodeId]: root },
    receipts: [receipt],
  }
}

export function sanitizeBranchName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function createBranch(
  graph: EditGraph,
  requestedName: string,
): EditGraph {
  const name = sanitizeBranchName(requestedName)
  if (!name) throw new Error('Branch name is empty after normalization.')
  if (graph.branches[name]) throw new Error(`Branch "${name}" already exists.`)

  return {
    ...graph,
    currentBranch: name,
    branches: {
      ...graph.branches,
      [name]: graph.currentNodeId,
    },
  }
}

export function checkoutNode(
  graph: EditGraph,
  nodeId: string,
): EditGraph {
  const node = graph.nodes[nodeId]
  if (!node) throw new Error(`Unknown edit graph node: ${nodeId}`)

  return {
    ...graph,
    currentNodeId: nodeId,
    currentBranch: node.branch,
  }
}

export function commitWorkspaceSnapshot(
  graph: EditGraph,
  artifact: ModelArtifact,
  edits: WorkspaceEditState,
  label: string,
  target: EditTarget = { kind: 'artifact' },
): EditGraph {
  const createdAt = now()
  const node: EditGraphNode = {
    id: id('edit-node'),
    parentIds: [graph.currentNodeId],
    branch: graph.currentBranch,
    kind: 'workspace-snapshot',
    label: label.trim() || `Workspace revision ${edits.revision}`,
    createdAt,
    sourceArtifactId: artifact.id,
    edits: cloneWorkspaceEdits(edits),
    target: cloneTarget(target),
    execution: 'manual',
  }

  return addNode(
    graph,
    node,
    makeReceipt(node, [
      'Manual workspace state committed to graph history.',
      'No neural inference was performed by this graph operation.',
    ]),
  )
}

export function recordNeuralEditIntent(
  graph: EditGraph,
  artifact: ModelArtifact,
  edits: WorkspaceEditState,
  instruction: string,
  target: EditTarget,
): EditGraph {
  const normalizedInstruction = instruction.trim()
  if (!normalizedInstruction) {
    throw new Error('Neural edit intent requires an instruction.')
  }

  const createdAt = now()
  const node: EditGraphNode = {
    id: id('edit-node'),
    parentIds: [graph.currentNodeId],
    branch: graph.currentBranch,
    kind: 'neural-intent',
    label: normalizedInstruction.slice(0, 72),
    createdAt,
    sourceArtifactId: artifact.id,
    edits: cloneWorkspaceEdits(edits),
    target: cloneTarget(target),
    instruction: normalizedInstruction,
    execution: 'recorded-only',
  }

  return addNode(
    graph,
    node,
    makeReceipt(node, [
      'Neural edit intent recorded only.',
      'No localized neural edit backend executed for this node.',
      target.kind === 'mesh'
        ? `Target mesh: ${target.mesh.id} (${target.mesh.name}).`
        : 'Target scope: whole artifact.',
    ]),
  )
}

export function recordDerivedExport(
  graph: EditGraph,
  artifact: ModelArtifact,
  edits: WorkspaceEditState,
  derived: DerivedArtifactLineage,
): EditGraph {
  const createdAt = now()
  const node: EditGraphNode = {
    id: id('edit-node'),
    parentIds: [graph.currentNodeId],
    branch: graph.currentBranch,
    kind: 'derived-export',
    label: derived.label,
    createdAt,
    sourceArtifactId: artifact.id,
    edits: cloneWorkspaceEdits(edits),
    target: { kind: 'artifact' },
    execution: 'exported',
    derivedArtifact: { ...derived },
  }

  return addNode(
    graph,
    node,
    makeReceipt(node, [
      'Derived GLB export recorded from the current workspace state.',
      `Derived SHA-256: ${derived.sha256}`,
      `Derived byte length: ${derived.byteLength}`,
    ]),
  )
}

export function currentGraphNode(graph: EditGraph): EditGraphNode {
  const node = graph.nodes[graph.currentNodeId]
  if (!node) throw new Error('Edit graph current node is missing.')
  return node
}

export function isWorkspaceDirty(
  graph: EditGraph,
  edits: WorkspaceEditState,
): boolean {
  const committed = currentGraphNode(graph).edits
  return JSON.stringify(committed) !== JSON.stringify(edits)
}

export function orderedGraphNodes(graph: EditGraph): EditGraphNode[] {
  return Object.values(graph.nodes).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
}
