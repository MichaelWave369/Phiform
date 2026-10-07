import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentConsole } from './components/AgentConsole'
import { Viewport } from './components/Viewport'
import {
  executeAgentCommand,
  parseAgentCommand,
} from './agent/engine'
import type {
  AgentCapability,
  AgentCommand,
  AgentReceipt,
  AgentStateFingerprint,
  AgentWorkspaceState,
} from './agent/types'
import {
  commandCatalog,
  installPhiFormAgentApi,
} from './agent/windowApi'
import {
  checkoutNode,
  commitWorkspaceSnapshot,
  createBranch,
  createEditGraph,
  currentGraphNode,
  isWorkspaceDirty,
  orderedGraphNodes,
  recordDerivedExport,
  recordNeuralEditIntent,
} from './core/editGraph'
import {
  createPortableProject,
  downloadPortableProject,
  loadProjectFromBrowser,
  readPortableProject,
  saveProjectToBrowser,
} from './core/projectStore'
import { receiptChecksum, receiptText } from './core/receipt'
import type {
  DerivedArtifactLineage,
  EditTarget,
  GenerationReceipt,
  ImageSource,
  MeshStats,
  MeshTarget,
  ModelArtifact,
  TransformMode,
  Vec3Tuple,
  WorkspaceEditState,
} from './core/types'
import {
  cloneWorkspaceEdits,
  defaultWorkspaceEdits,
  degrees,
  radians,
} from './core/workspace'
import type { BridgeBackend } from './neural/bridgeTypes'
import { LocalBridgeAdapter } from './neural/localBridgeAdapter'
import { LocalBridgeClient } from './neural/localBridgeClient'
import { mockAdapter } from './neural/mockAdapter'

const initialArtifact: ModelArtifact = {
  kind: 'primitive',
  id: 'artifact-bootstrap',
  label: 'PhiForm seed',
  primitive: 'torus',
  seed: 369,
  scale: [1, 1, 1],
  material: { metalness: 0.38, roughness: 0.42 },
  createdAt: new Date().toISOString(),
}

const emptyStats: MeshStats = {
  meshes: 0,
  vertices: 0,
  triangles: 0,
  materials: 0,
  bounds: [0, 0, 0],
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function safeName(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'phiform-model'
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function derivedId(): string {
  const uuid = crypto.randomUUID?.()
  return uuid ? `derived-${uuid}` : `derived-${Date.now().toString(36)}`
}

function agentFingerprint(state: AgentWorkspaceState): AgentStateFingerprint {
  return {
    artifactId: state.artifact.id,
    nodeId: state.editGraph.currentNodeId,
    branch: state.editGraph.currentBranch,
    revision: state.edits.revision,
    target: state.target.kind === 'mesh' ? state.target.mesh.id : 'artifact',
  }
}

export function App() {
  const [prompt, setPrompt] = useState('luminous nested portal machine')
  const [image, setImage] = useState<ImageSource | undefined>()
  const [imageFile, setImageFile] = useState<File | undefined>()
  const [artifact, setArtifact] = useState<ModelArtifact>(initialArtifact)
  const [receipts, setReceipts] = useState<GenerationReceipt[]>([])
  const [edits, setEdits] = useState<WorkspaceEditState>(defaultWorkspaceEdits)
  const [editGraph, setEditGraph] = useState(() =>
    createEditGraph(initialArtifact, defaultWorkspaceEdits()),
  )
  const [target, setTarget] = useState<EditTarget>({ kind: 'artifact' })
  const [meshTargets, setMeshTargets] = useState<MeshTarget[]>([])
  const [meshStats, setMeshStats] = useState<MeshStats>(emptyStats)
  const [transformMode, setTransformMode] = useState<TransformMode>('translate')
  const [selected, setSelected] = useState(true)
  const [exportRequest, setExportRequest] = useState(0)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<'proof' | 'bridge'>('proof')
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:8787')
  const [backends, setBackends] = useState<BridgeBackend[]>([])
  const [backendId, setBackendId] = useState('')
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'checking' | 'online' | 'error'>('idle')
  const [error, setError] = useState('')
  const [projectStatus, setProjectStatus] = useState('')
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [branchName, setBranchName] = useState('')
  const [neuralInstruction, setNeuralInstruction] = useState('')
  const [agentReceipts, setAgentReceipts] = useState<AgentReceipt[]>([])
  const [agentGrants, setAgentGrants] = useState<Set<AgentCapability>>(
    () => new Set<AgentCapability>(['workspace.read']),
  )
  const [pendingExportFilename, setPendingExportFilename] = useState<string | undefined>()
  const importRef = useRef<HTMLInputElement>(null)
  const agentStateRef = useRef<AgentWorkspaceState>({
    artifact: initialArtifact,
    edits: defaultWorkspaceEdits(),
    editGraph: createEditGraph(initialArtifact, defaultWorkspaceEdits()),
    target: { kind: 'artifact' },
    meshTargets: [],
  })
  const agentReceiptsRef = useRef<AgentReceipt[]>([])
  const agentGrantsRef = useRef<Set<AgentCapability>>(
    new Set<AgentCapability>(['workspace.read']),
  )

  const latestReceipt = receipts[0]
  const checksum = useMemo(
    () => (latestReceipt ? receiptChecksum(latestReceipt) : 'no receipt yet'),
    [latestReceipt],
  )
  const graphNodes = useMemo(() => orderedGraphNodes(editGraph), [editGraph])
  const latestEditReceipt = editGraph.receipts.at(-1)
  const dirty = useMemo(
    () => isWorkspaceDirty(editGraph, edits),
    [editGraph, edits],
  )

  const agentState = useMemo<AgentWorkspaceState>(
    () => ({
      artifact,
      edits,
      editGraph,
      target,
      meshTargets,
    }),
    [artifact, edits, editGraph, target, meshTargets],
  )
  const agentStateFingerprint = useMemo(
    () => agentFingerprint(agentState),
    [agentState],
  )

  useEffect(() => {
    agentStateRef.current = agentState
    agentReceiptsRef.current = agentReceipts
    agentGrantsRef.current = agentGrants
  }, [agentState, agentReceipts, agentGrants])

  const selectedBackend = backends.find((backend) => backend.id === backendId)
  const availableBackends = backends.filter((backend) => backend.available)
  const unavailableBackends = backends.filter((backend) => !backend.available)

  const changeAgentGrant = (capability: AgentCapability, enabled: boolean) => {
    setAgentGrants((current) => {
      const next = new Set(current)
      if (enabled) next.add(capability)
      else next.delete(capability)
      agentGrantsRef.current = next
      return next
    })
  }

  const executeGovernedAgentCommand = (command: AgentCommand): AgentReceipt => {
    const execution = executeAgentCommand(
      agentStateRef.current,
      command,
      agentGrantsRef.current,
      agentReceiptsRef.current,
    )

    const nextReceipts = [
      ...agentReceiptsRef.current,
      execution.receipt,
    ].slice(-200)

    agentReceiptsRef.current = nextReceipts
    setAgentReceipts(nextReceipts)

    if (execution.receipt.status !== 'rejected') {
      agentStateRef.current = execution.state
      setArtifact(execution.state.artifact)
      setEdits(execution.state.edits)
      setEditGraph(execution.state.editGraph)
      setTarget(execution.state.target)
      setSelected(true)

      for (const effect of execution.effects) {
        if (effect.kind === 'export-glb') {
          setPendingExportFilename(effect.filename)
          setExportRequest((value) => value + 1)
        }
      }
    }

    return execution.receipt
  }

  useEffect(() => {
    return installPhiFormAgentApi(
      () => ({
        schema: 'phiform.agent-descriptor.v1',
        version: '0.6.0',
        commands: commandCatalog(),
        grantedCapabilities: [...agentGrantsRef.current],
        state: agentFingerprint(agentStateRef.current),
        meshTargets: agentStateRef.current.meshTargets.map((mesh) => ({ ...mesh })),
      }),
      (value) => executeGovernedAgentCommand(parseAgentCommand(value)),
    )
  }, [])

  const connectBridge = async () => {
    setBridgeStatus('checking')
    setError('')
    try {
      const client = new LocalBridgeClient(endpoint)
      await client.health()
      const discovered = await client.backends()
      const available = discovered.filter((backend) => backend.available)
      setBackends(discovered)
      setBackendId((current) =>
        available.some((backend) => backend.id === current)
          ? current
          : available.find((backend) => backend.kind === 'neural')?.id
            ?? available[0]?.id
            ?? '',
      )
      setBridgeStatus('online')
    } catch (cause) {
      setBackends([])
      setBackendId('')
      setBridgeStatus('error')
      setError(cause instanceof Error ? cause.message : 'Bridge connection failed.')
    }
  }

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const adapter =
        mode === 'proof'
          ? mockAdapter
          : selectedBackend
            ? new LocalBridgeAdapter(endpoint, selectedBackend)
            : undefined

      if (!adapter) {
        throw new Error('Connect the local bridge and select an available backend first.')
      }

      const result = await adapter.generate({ prompt, image }, { imageFile })
      const nextEdits = defaultWorkspaceEdits()
      setArtifact(result.artifact)
      setReceipts((current) => [result.receipt, ...current].slice(0, 12))
      setEdits(nextEdits)
      setEditGraph(createEditGraph(result.artifact, nextEdits, result.receipt))
      setTarget({ kind: 'artifact' })
      setMeshTargets([])
      setSelected(true)
      setAgentReceipts([])
      agentReceiptsRef.current = []
      setProjectStatus('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  const selectImage = (file?: File) => {
    setImageFile(file)
    if (!file) {
      setImage(undefined)
      return
    }
    setImage({ name: file.name, type: file.type || 'unknown', size: file.size })
  }

  const copyReceipt = async () => {
    if (!latestReceipt) return
    await navigator.clipboard.writeText(receiptText(latestReceipt))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const updateVector = (
    field: 'position' | 'rotation' | 'scale',
    index: number,
    value: number,
  ) => {
    setEdits((current) => {
      const next = [...current[field]] as Vec3Tuple
      next[index] = field === 'rotation' ? radians(value) : value
      return {
        ...current,
        [field]: next,
        revision: current.revision + 1,
      }
    })
  }

  const resetEdits = () => {
    setEdits(defaultWorkspaceEdits())
    setSelected(true)
  }

  const commitSnapshot = () => {
    setError('')
    try {
      const next = commitWorkspaceSnapshot(
        editGraph,
        artifact,
        edits,
        snapshotLabel,
        target,
      )
      setEditGraph(next)
      setSnapshotLabel('')
      setProjectStatus('WORKSPACE SNAPSHOT COMMITTED')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Snapshot commit failed.')
    }
  }

  const addBranch = () => {
    setError('')
    try {
      const next = createBranch(editGraph, branchName)
      setEditGraph(next)
      setBranchName('')
      setProjectStatus(`BRANCH ${next.currentBranch} CREATED`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Branch creation failed.')
    }
  }

  const recordIntent = () => {
    setError('')
    try {
      const next = recordNeuralEditIntent(
        editGraph,
        artifact,
        edits,
        neuralInstruction,
        target,
      )
      setEditGraph(next)
      setNeuralInstruction('')
      setProjectStatus('NEURAL EDIT INTENT RECORDED · NOT EXECUTED')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Edit intent failed.')
    }
  }

  const checkout = (nodeId: string) => {
    setError('')
    try {
      const next = checkoutNode(editGraph, nodeId)
      const node = currentGraphNode(next)
      setEditGraph(next)
      setEdits(cloneWorkspaceEdits(node.edits))
      setTarget(node.target)
      setSelected(true)
      setProjectStatus(`CHECKED OUT ${node.label}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Graph checkout failed.')
    }
  }

  const saveLocal = async () => {
    setProjectStatus('SAVING…')
    setError('')
    try {
      await saveProjectToBrowser(
        artifact,
        edits,
        editGraph,
        agentReceipts,
        latestReceipt,
      )
      setProjectStatus('SAVED LOCALLY')
    } catch (cause) {
      setProjectStatus('')
      setError(cause instanceof Error ? cause.message : 'Project save failed.')
    }
  }

  const applyProject = (project: Awaited<ReturnType<typeof loadProjectFromBrowser>>) => {
    setArtifact(project.artifact)
    setEdits(project.edits)
    setEditGraph(project.editGraph)
    setReceipts(project.latestReceipt ? [project.latestReceipt] : [])
    setTarget(currentGraphNode(project.editGraph).target)
    const importedAgentReceipts = project.agentReceipts as AgentReceipt[]
    setAgentReceipts(importedAgentReceipts)
    agentReceiptsRef.current = importedAgentReceipts
    setMeshTargets([])
    setSelected(true)
  }

  const loadLocal = async () => {
    setProjectStatus('LOADING…')
    setError('')
    try {
      const project = await loadProjectFromBrowser()
      applyProject(project)
      setProjectStatus('LOCAL PROJECT LOADED')
    } catch (cause) {
      setProjectStatus('')
      setError(cause instanceof Error ? cause.message : 'Project load failed.')
    }
  }

  const exportProject = async () => {
    setProjectStatus('PACKING PROJECT…')
    setError('')
    try {
      const project = await createPortableProject(
        artifact,
        edits,
        editGraph,
        agentReceipts,
        latestReceipt,
      )
      downloadPortableProject(project)
      setProjectStatus('PROJECT V3 EXPORTED')
    } catch (cause) {
      setProjectStatus('')
      setError(cause instanceof Error ? cause.message : 'Project export failed.')
    }
  }

  const importProject = async (file?: File) => {
    if (!file) return
    setProjectStatus('IMPORTING…')
    setError('')
    try {
      const project = await readPortableProject(file)
      applyProject(project)
      setProjectStatus('PROJECT IMPORTED')
    } catch (cause) {
      setProjectStatus('')
      setError(cause instanceof Error ? cause.message : 'Project import failed.')
    }
  }

  const handleEditedExport = async (blob: Blob) => {
    try {
      const filename = pendingExportFilename?.trim()
        || `${safeName(artifact.label)}-edited.glb`
      setPendingExportFilename(undefined)
      const sha256 = await sha256Blob(blob)
      const derived: DerivedArtifactLineage = {
        id: derivedId(),
        label: filename,
        format: 'glb',
        sha256,
        byteLength: blob.size,
        createdAt: new Date().toISOString(),
      }
      setEditGraph((current) =>
        recordDerivedExport(current, artifact, edits, derived),
      )
      downloadBlob(blob, filename)
      setProjectStatus(`DERIVED GLB EXPORTED · ${sha256.slice(0, 12)}…`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Derived export receipt failed.')
    }
  }

  const artifactType = artifact.kind === 'glb' ? 'GLB' : artifact.primitive
  const artifactDetail = artifact.kind === 'glb'
    ? artifact.backendId
    : artifact.scale.map((value) => value.toFixed(2)).join(' / ')

  const targetLabel = target.kind === 'mesh'
    ? `${target.mesh.id} · ${target.mesh.name}`
    : 'whole artifact'

  const vectorFields: Array<{
    key: 'position' | 'rotation' | 'scale'
    label: string
    values: Vec3Tuple
  }> = [
    { key: 'position', label: 'POSITION', values: edits.position },
    {
      key: 'rotation',
      label: 'ROTATION °',
      values: edits.rotation.map((value) => degrees(value)) as Vec3Tuple,
    },
    { key: 'scale', label: 'SCALE', values: edits.scale },
  ]

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">Φ</div>
          <div>
            <strong>PhiForm</strong>
            <span>Neural 3D Workbench</span>
          </div>
        </div>

        <div className="top-status">
          <span className="pill"><i /> RUNG 6</span>
          <span className="pill muted">
            {editGraph.currentBranch} · {dirty ? 'WORKING TREE DIRTY' : 'COMMITTED'}
          </span>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel input-panel">
          <div className="panel-heading">
            <span>01</span>
            <div>
              <h2>Intent</h2>
              <p>Generate source geometry, then branch and target edits.</p>
            </div>
          </div>

          <label className="field-label" htmlFor="prompt">FORM PROMPT</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe an object, prop, creature, machine..."
          />

          <label className="upload">
            <input
              type="file"
              accept="image/*"
              onChange={(event) => selectImage(event.target.files?.[0])}
            />
            <span className="upload-icon">+</span>
            <span>
              <strong>{image ? image.name : 'Attach reference image'}</strong>
              <small>{image ? `${image.type} · ${bytes(image.size)}` : 'PNG / JPG / WEBP'}</small>
            </span>
          </label>

          {image && (
            <button className="text-button" onClick={() => selectImage(undefined)}>
              remove image binding
            </button>
          )}

          <div className="adapter-card">
            <span className="eyebrow">INFERENCE PATH</span>
            <div className="mode-switch">
              <button className={mode === 'proof' ? 'active' : ''} onClick={() => setMode('proof')}>PROOF</button>
              <button className={mode === 'bridge' ? 'active' : ''} onClick={() => setMode('bridge')}>LOCAL BRIDGE</button>
            </div>

            {mode === 'proof' ? (
              <>
                <strong>{mockAdapter.label}</strong>
                <p>Deterministic procedural path. No neural inference is claimed.</p>
              </>
            ) : (
              <div className="bridge-config">
                <label className="field-label" htmlFor="bridge-endpoint">BRIDGE ENDPOINT</label>
                <input id="bridge-endpoint" type="text" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
                <button className="connect" disabled={bridgeStatus === 'checking'} onClick={connectBridge}>
                  {bridgeStatus === 'checking' ? 'CHECKING…' : 'CONNECT / REFRESH'}
                </button>
                <div className={`bridge-state ${bridgeStatus}`}><span />{bridgeStatus.toUpperCase()}</div>

                {availableBackends.length > 0 && (
                  <>
                    <label className="field-label" htmlFor="backend">BACKEND</label>
                    <select id="backend" value={backendId} onChange={(event) => setBackendId(event.target.value)}>
                      {availableBackends.map((backend) => (
                        <option key={backend.id} value={backend.id}>{backend.label} · {backend.kind}</option>
                      ))}
                    </select>
                    {selectedBackend && (
                      <p>{selectedBackend.model ?? selectedBackend.id}{selectedBackend.license ? ` · ${selectedBackend.license}` : ''}</p>
                    )}
                  </>
                )}

                {unavailableBackends.length > 0 && (
                  <div className="backend-unavailable-list">
                    {unavailableBackends.map((backend) => (
                      <div className="backend-unavailable" key={backend.id}>
                        <strong>{backend.label} · OFFLINE</strong>
                        <p>{backend.statusReason ?? 'Backend unavailable.'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div className="error-strip">{error}</div>}

          <button className="generate" disabled={busy} onClick={generate}>
            <span>{busy ? 'FORMING…' : 'GENERATE FORM'}</span><b>↗</b>
          </button>
        </aside>

        <section className="stage">
          <div className="stage-meta">
            <span>ARTIFACT / {artifact.id.slice(0, 22)}</span>
            <span>NODE / {editGraph.currentNodeId.slice(0, 18)}</span>
          </div>

          <Viewport
            artifact={artifact}
            edits={edits}
            transformMode={transformMode}
            selected={selected}
            target={target}
            exportRequest={exportRequest}
            onSelectedChange={setSelected}
            onTargetChange={setTarget}
            onMeshTargetsChange={setMeshTargets}
            onEditsChange={setEdits}
            onStatsChange={setMeshStats}
            onExportComplete={(blob) => { void handleEditedExport(blob) }}
            onError={setError}
          />

          <div className="stage-footer">
            <div>
              <span className="eyebrow">CURRENT FORM</span>
              <strong>{artifact.label}</strong>
            </div>
            <div className="stage-stats">
              <span>{artifactType}</span>
              <span>{meshStats.meshes} meshes</span>
              <span>{meshStats.triangles.toLocaleString()} tris</span>
              <span>{dirty ? 'dirty' : 'committed'}</span>
            </div>
          </div>
        </section>

        <aside className="panel inspector-panel">
          <div className="panel-heading">
            <span>02</span>
            <div>
              <h2>Workspace + Graph</h2>
              <p>Edit working state, commit snapshots, branch, and record neural intent.</p>
            </div>
          </div>

          <div className="metric-grid">
            <div><span>TYPE</span><strong>{artifactType}</strong></div>
            <div><span>{artifact.kind === 'glb' ? 'BACKEND' : 'SOURCE SCALE'}</span><strong>{artifactDetail}</strong></div>
            <div><span>VERTICES</span><strong>{meshStats.vertices.toLocaleString()}</strong></div>
            <div><span>TRIANGLES</span><strong>{meshStats.triangles.toLocaleString()}</strong></div>
            <div><span>GRAPH NODES</span><strong>{graphNodes.length}</strong></div>
            <div><span>BRANCHES</span><strong>{Object.keys(editGraph.branches).length}</strong></div>
            <div><span>AGENT RECEIPTS</span><strong>{agentReceipts.length}</strong></div>
            <div><span>AGENT GRANTS</span><strong>{agentGrants.size}</strong></div>
          </div>

          <div className="editor-card">
            <div className="editor-head">
              <span className="eyebrow">TRANSFORM</span>
              <button onClick={() => setSelected((value) => !value)}>
                {selected ? 'DESELECT' : 'SELECT'}
              </button>
            </div>

            <div className="tool-tabs">
              {(['translate', 'rotate', 'scale'] as TransformMode[]).map((tool) => (
                <button
                  key={tool}
                  className={transformMode === tool ? 'active' : ''}
                  onClick={() => {
                    setTransformMode(tool)
                    setSelected(true)
                  }}
                >
                  {tool.toUpperCase()}
                </button>
              ))}
            </div>

            {vectorFields.map((field) => (
              <div className="vector-row" key={field.key}>
                <span>{field.label}</span>
                <div>
                  {field.values.map((value, index) => (
                    <input
                      key={index}
                      aria-label={`${field.label} ${['X', 'Y', 'Z'][index]}`}
                      type="number"
                      step={field.key === 'rotation' ? 1 : 0.05}
                      value={Number(value.toFixed(field.key === 'rotation' ? 1 : 3))}
                      onChange={(event) => updateVector(field.key, index, Number(event.target.value))}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="material-edit">
              <label>
                <input
                  type="checkbox"
                  checked={edits.material.enabled}
                  onChange={(event) =>
                    setEdits((current) => ({
                      ...current,
                      material: { ...current.material, enabled: event.target.checked },
                      revision: current.revision + 1,
                    }))
                  }
                />
                MATERIAL OVERRIDE
              </label>

              <div className="material-grid">
                <label>
                  COLOR
                  <input
                    type="color"
                    value={edits.material.color}
                    disabled={!edits.material.enabled}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        material: { ...current.material, color: event.target.value },
                        revision: current.revision + 1,
                      }))
                    }
                  />
                </label>
                <label>
                  METAL {edits.material.metalness.toFixed(2)}
                  <input
                    type="range" min="0" max="1" step="0.01"
                    disabled={!edits.material.enabled}
                    value={edits.material.metalness}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        material: { ...current.material, metalness: Number(event.target.value) },
                        revision: current.revision + 1,
                      }))
                    }
                  />
                </label>
                <label>
                  ROUGH {edits.material.roughness.toFixed(2)}
                  <input
                    type="range" min="0" max="1" step="0.01"
                    disabled={!edits.material.enabled}
                    value={edits.material.roughness}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        material: { ...current.material, roughness: Number(event.target.value) },
                        revision: current.revision + 1,
                      }))
                    }
                  />
                </label>
              </div>
            </div>

            <div className="bounds-readout">
              BOUNDS · {meshStats.bounds.map((value) => value.toFixed(2)).join(' × ')}
            </div>
            <button className="reset-edits" onClick={resetEdits}>RESET WORKING TREE</button>
          </div>

          <div className="graph-card">
            <div className="graph-head">
              <div>
                <span className="eyebrow">EDIT GRAPH</span>
                <strong>{editGraph.currentBranch}</strong>
              </div>
              <span className={dirty ? 'dirty' : 'clean'}>{dirty ? 'DIRTY' : 'CLEAN'}</span>
            </div>

            <div className="target-readout">
              <span>TARGET</span>
              <strong>{targetLabel}</strong>
              {target.kind === 'mesh' && (
                <small>
                  {target.mesh.vertices.toLocaleString()} verts · {target.mesh.triangles.toLocaleString()} tris
                </small>
              )}
              {target.kind === 'mesh' && (
                <button onClick={() => setTarget({ kind: 'artifact' })}>TARGET WHOLE ARTIFACT</button>
              )}
            </div>

            <label className="field-label" htmlFor="snapshot-label">SNAPSHOT LABEL</label>
            <div className="inline-action">
              <input
                id="snapshot-label"
                type="text"
                value={snapshotLabel}
                placeholder={`revision ${edits.revision}`}
                onChange={(event) => setSnapshotLabel(event.target.value)}
              />
              <button onClick={commitSnapshot}>COMMIT</button>
            </div>

            <label className="field-label" htmlFor="branch-name">NEW BRANCH</label>
            <div className="inline-action">
              <input
                id="branch-name"
                type="text"
                value={branchName}
                placeholder="handle-variant"
                onChange={(event) => setBranchName(event.target.value)}
              />
              <button onClick={addBranch}>BRANCH</button>
            </div>

            <label className="field-label" htmlFor="neural-intent">NEURAL EDIT INTENT</label>
            <textarea
              id="neural-intent"
              className="graph-intent"
              value={neuralInstruction}
              onChange={(event) => setNeuralInstruction(event.target.value)}
              placeholder={
                target.kind === 'mesh'
                  ? `Describe an edit for ${target.mesh.name}…`
                  : 'Describe a whole-artifact neural edit…'
              }
            />
            <button className="record-intent" onClick={recordIntent}>
              RECORD INTENT · DO NOT EXECUTE
            </button>
            <p className="graph-caveat">
              Rung 5 records target + instruction + lineage. No localized neural edit backend is claimed or executed.
            </p>

            <div className="graph-nodes">
              {[...graphNodes].reverse().slice(0, 12).map((node) => (
                <button
                  className={node.id === editGraph.currentNodeId ? 'current' : ''}
                  key={node.id}
                  onClick={() => checkout(node.id)}
                >
                  <span>{node.kind.replaceAll('-', ' ')}</span>
                  <strong>{node.label}</strong>
                  <small>{node.branch} · {node.execution}</small>
                </button>
              ))}
            </div>

            {latestEditReceipt && (
              <div className="edit-receipt-mini">
                <span>LATEST EDIT RECEIPT</span>
                <strong>{latestEditReceipt.id}</strong>
                <small>{latestEditReceipt.operation} · {latestEditReceipt.execution}</small>
              </div>
            )}
          </div>

          <AgentConsole
            state={agentStateFingerprint}
            meshTargets={meshTargets}
            grants={agentGrants}
            receipts={agentReceipts}
            onGrantChange={changeAgentGrant}
            onExecute={executeGovernedAgentCommand}
          />

          <div className="project-card">
            <span className="eyebrow">PROJECT + DERIVED EXPORT</span>
            <div className="project-actions">
              <button onClick={saveLocal}>SAVE LOCAL</button>
              <button onClick={loadLocal}>LOAD LOCAL</button>
              <button onClick={exportProject}>EXPORT .PHIFORM</button>
              <button onClick={() => importRef.current?.click()}>IMPORT .PHIFORM</button>
              <button
                className="wide"
                onClick={() => {
                  setPendingExportFilename(undefined)
                  setExportRequest((value) => value + 1)
                }}
              >
                EXPORT + RECEIPT EDITED GLB
              </button>
            </div>
            <input
              ref={importRef}
              type="file"
              accept=".json,.phiform.json,application/json"
              hidden
              onChange={(event) => {
                void importProject(event.target.files?.[0])
                event.currentTarget.value = ''
              }}
            />
            {projectStatus && <div className="project-status">{projectStatus}</div>}
          </div>

          <div className="receipt">
            <div className="receipt-head">
              <div>
                <span className="eyebrow">SOURCE RECEIPT</span>
                <strong>{latestReceipt?.id ?? 'No generation receipt'}</strong>
              </div>
              <button disabled={!latestReceipt} onClick={copyReceipt}>
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <dl>
              <div><dt>adapter</dt><dd>{latestReceipt?.adapterId ?? '—'}</dd></div>
              <div><dt>job</dt><dd>{latestReceipt?.jobId ?? '—'}</dd></div>
              <div><dt>sha256</dt><dd>{latestReceipt?.output?.sha256 ?? '—'}</dd></div>
              <div><dt>receipt</dt><dd>{checksum}</dd></div>
              <div><dt>graph</dt><dd>{editGraph.schema}</dd></div>
            </dl>
          </div>

          <div className="authority-note">
            <span>CAPABILITY ≠ AUTHORITY</span>
            <p>
              Agent commands are explicit verbs with operator-granted capabilities,
              stale-state preconditions, replay protection, and receipts. Browser agents
              use the same command executor as this console through window.PhiFormAgent.
            </p>
          </div>
        </aside>
      </section>
    </main>
  )
}
