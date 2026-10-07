import { useEffect, useMemo, useRef, useState } from 'react'
import { AgentConsole } from './components/AgentConsole'
import { EnginePackPanel } from './components/EnginePackPanel'
import { ProductionPanel } from './components/ProductionPanel'
import { TexturePanel } from './components/TexturePanel'
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
  BasisuDerivedReceipt,
  DerivedArtifactLineage,
  EditTarget,
  EnginePackReceipt,
  EngineTarget,
  GenerationReceipt,
  ImageSource,
  MeshStats,
  MeshTarget,
  ModelArtifact,
  ProductionAudit,
  ProductionProfileId,
  ProductionReceipt,
  TextureAudit,
  TextureEncoderCodec,
  TextureEncoderDescriptor,
  TextureEncodingReceipt,
  TextureProfileId,
  TextureReceipt,
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
import { productionProfile } from './production/profiles'
import type { ProductionRuntimeResult } from './production/runtime'
import {
  buildEnginePack,
  engineImportInstructions,
  sha256Bytes,
  type EnginePackInputFile,
} from './engine/pack'
import type { EngineRuntimeResult } from './engine/runtime'
import {
  buildTextureReceipt,
  compressionPlan,
} from './texture/audit'
import { TextureEncoderClient } from './texture/encoderClient'
import type { PreparedTexturePng } from './texture/sourcePng'
import {
  rewriteGlbWithBasisu,
  type VerifiedKtx2Payload,
} from './gltf/basisuGlb'

interface SessionKtx2Payload {
  textureId: string
  textureName: string
  sha256: string
  blob: Blob
}

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

const KTX2_MAGIC = [
  0xab, 0x4b, 0x54, 0x58,
  0x20, 0x32, 0x30, 0xbb,
  0x0d, 0x0a, 0x1a, 0x0a,
]

async function sha256Blob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

async function verifyKtx2Blob(
  blob: Blob,
  expectedSha256: string,
  expectedByteLength: number,
): Promise<string> {
  if (blob.size !== expectedByteLength) {
    throw new Error(
      `KTX2 byte length mismatch: expected ${expectedByteLength}, received ${blob.size}.`,
    )
  }

  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  if (
    header.length !== KTX2_MAGIC.length ||
    !KTX2_MAGIC.every((value, index) => header[index] === value)
  ) {
    throw new Error('Returned texture artifact failed the KTX2 identifier check.')
  }

  const actualSha256 = await sha256Blob(blob)
  if (actualSha256 !== expectedSha256) {
    throw new Error('Browser SHA-256 did not match the bridge KTX2 hash.')
  }

  return actualSha256
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
  const [productionProfileId, setProductionProfileId] =
    useState<ProductionProfileId>('web-balanced')
  const [productionAudit, setProductionAudit] = useState<ProductionAudit | undefined>()
  const [productionReceipts, setProductionReceipts] = useState<ProductionReceipt[]>([])
  const [productionRequest, setProductionRequest] = useState(0)
  const [productionBusy, setProductionBusy] = useState(false)
  const [engineTarget, setEngineTarget] = useState<EngineTarget>('godot')
  const [engineRequest, setEngineRequest] = useState(0)
  const [engineBusy, setEngineBusy] = useState(false)
  const [enginePackReceipts, setEnginePackReceipts] = useState<EnginePackReceipt[]>([])
  const [textureProfileId, setTextureProfileId] =
    useState<TextureProfileId>('game-textures')
  const [textureAudit, setTextureAudit] = useState<TextureAudit | undefined>()
  const [textureReceipts, setTextureReceipts] = useState<TextureReceipt[]>([])
  const [textureEncoder, setTextureEncoder] =
    useState<TextureEncoderDescriptor | undefined>()
  const [textureEncoderStatus, setTextureEncoderStatus] =
    useState<'idle' | 'checking' | 'online' | 'error'>('idle')
  const [textureEncodeRequest, setTextureEncodeRequest] = useState(0)
  const [textureEncodingBusy, setTextureEncodingBusy] = useState(false)
  const [textureEncodingReceipts, setTextureEncodingReceipts] =
    useState<TextureEncodingReceipt[]>([])
  const [sessionKtx2Payloads, setSessionKtx2Payloads] =
    useState<SessionKtx2Payload[]>([])
  const [basisuGlbRequest, setBasisuGlbRequest] = useState(0)
  const [basisuBusy, setBasisuBusy] = useState(false)
  const [basisuDerivedReceipts, setBasisuDerivedReceipts] =
    useState<BasisuDerivedReceipt[]>([])
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
      setProductionReceipts([])
      setProductionAudit(undefined)
      setEnginePackReceipts([])
      setTextureReceipts([])
      setTextureEncodingReceipts([])
      setSessionKtx2Payloads([])
      setBasisuDerivedReceipts([])
      setTextureAudit(undefined)
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
        productionReceipts,
        enginePackReceipts,
        textureReceipts,
        textureEncodingReceipts,
        basisuDerivedReceipts,
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
    setProductionReceipts(project.productionReceipts)
    setEnginePackReceipts(project.enginePackReceipts)
    setTextureReceipts(project.textureReceipts)
    setTextureEncodingReceipts(project.textureEncodingReceipts)
    setBasisuDerivedReceipts(project.basisuDerivedReceipts)
    setSessionKtx2Payloads([])
    setProductionAudit(undefined)
    setTextureAudit(undefined)
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
        productionReceipts,
        enginePackReceipts,
        textureReceipts,
        textureEncodingReceipts,
        basisuDerivedReceipts,
        latestReceipt,
      )
      downloadPortableProject(project)
      setProjectStatus('PROJECT V8 EXPORTED')
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

  const probeTextureEncoder = async () => {
    setTextureEncoderStatus('checking')
    setError('')
    try {
      const descriptor = await new TextureEncoderClient(endpoint).descriptor()
      setTextureEncoder(descriptor)
      setTextureEncoderStatus(descriptor.available ? 'online' : 'error')
      if (!descriptor.available) {
        setError(
          descriptor.statusReason ||
          'Khronos KTX encoder is unavailable on the local bridge.',
        )
      }
    } catch (cause) {
      setTextureEncoder(undefined)
      setTextureEncoderStatus('error')
      setError(
        cause instanceof Error
          ? cause.message
          : 'Texture encoder probe failed.',
      )
    }
  }

  const beginTextureEncoding = async () => {
    setError('')
    try {
      if (!textureAudit) {
        throw new Error('No texture audit is available for the current scene.')
      }
      if (textureAudit.qualification === 'fail') {
        throw new Error(
          'Texture encoding is blocked while the current audit is FAIL.',
        )
      }
      if (textureAudit.totals.textures === 0) {
        throw new Error('The current scene has no texture maps to encode.')
      }

      const descriptor = await new TextureEncoderClient(endpoint).descriptor()
      setTextureEncoder(descriptor)
      setTextureEncoderStatus(descriptor.available ? 'online' : 'error')
      if (!descriptor.available) {
        throw new Error(
          descriptor.statusReason ||
          'Khronos KTX encoder is unavailable on the local bridge.',
        )
      }

      setTextureEncodingBusy(true)
      setProjectStatus('PREPARING TEXTURE SOURCES…')
      setTextureEncodeRequest((value) => value + 1)
    } catch (cause) {
      setTextureEncodingBusy(false)
      setError(
        cause instanceof Error
          ? cause.message
          : 'Texture encoding could not start.',
      )
    }
  }

  const handleTextureSourcesReady = async (
    audit: TextureAudit,
    sources: PreparedTexturePng[],
  ) => {
    setError('')
    try {
      if (sources.length === 0) {
        throw new Error('No browser-readable texture sources were prepared.')
      }

      const client = new TextureEncoderClient(endpoint)
      const plan = compressionPlan(audit)
      const completed: Array<{
        source: PreparedTexturePng
        blob: Blob
        artifact: TextureEncodingReceipt['artifacts'][number]
        encoderVersion: string
      }> = []

      for (let index = 0; index < sources.length; index += 1) {
        const source = sources[index]
        const planned = plan.find(
          (entry) => entry.textureId === source.textureId,
        )
        if (!planned) {
          throw new Error(
            `No compression plan exists for texture ${source.name}.`,
          )
        }

        const codec: TextureEncoderCodec =
          planned.mode === 'uastc'
            ? 'uastc-ldr-4x4'
            : 'basis-lz'

        setProjectStatus(
          `ENCODING TEXTURE ${index + 1}/${sources.length} · ${codec}`,
        )

        const submitted = await client.submit(
          source.textureId,
          source.blob,
          source.sha256,
          codec,
          source.colorSpace,
        )
        const job = await client.waitForJob(submitted.id)

        if (!job.artifact || !job.encoder) {
          throw new Error(
            `Texture job ${job.id} completed without artifact evidence.`,
          )
        }
        if (
          job.sourceSha256 !== source.sha256 ||
          job.sourceByteLength !== source.blob.size
        ) {
          throw new Error(
            `Bridge source evidence changed for texture ${source.name}.`,
          )
        }

        const blob = await client.artifact(job)
        const browserHash = await verifyKtx2Blob(
          blob,
          job.artifact.sha256,
          job.artifact.byteLength,
        )
        const outputFilename =
          `${safeName(source.name)}-${source.textureId.slice(0, 8)}-` +
          `${codec === 'basis-lz' ? 'etc1s' : 'uastc'}.ktx2`

        completed.push({
          source,
          blob,
          encoderVersion: job.encoder.version,
          artifact: {
            textureId: source.textureId,
            name: source.name,
            roles: [...source.roles],
            codec,
            sourcePngSha256: source.sha256,
            sourcePngByteLength: source.blob.size,
            outputSha256: browserHash,
            outputByteLength: blob.size,
            outputFilename,
            compressionRatio:
              source.blob.size / Math.max(blob.size, 1),
            browserHashVerified: true,
          },
        })
      }

      const encoderVersions = new Set(
        completed.map((entry) => entry.encoderVersion),
      )
      if (encoderVersions.size !== 1) {
        throw new Error(
          'Texture batch crossed encoder versions; refusing one mixed receipt.',
        )
      }

      const totalSourcePngBytes = completed.reduce(
        (sum, entry) => sum + entry.source.blob.size,
        0,
      )
      const totalOutputBytes = completed.reduce(
        (sum, entry) => sum + entry.blob.size,
        0,
      )

      const receipt: TextureEncodingReceipt = {
        schema: 'phiform.texture-encode-receipt.v1',
        id:
          `texture-encode-receipt-` +
          (crypto.randomUUID?.() ?? Date.now().toString(36)),
        createdAt: new Date().toISOString(),
        sourceArtifactId: artifact.id,
        sourceNodeId: editGraph.currentNodeId,
        profileId: audit.profileId,
        encoderId: 'khronos.ktx.v1',
        encoderVersion: [...encoderVersions][0] ?? 'unknown',
        compressionExecuted: true,
        allOutputsValidated: true,
        totalSourcePngBytes,
        totalOutputBytes,
        aggregateCompressionRatio:
          totalSourcePngBytes / Math.max(totalOutputBytes, 1),
        artifacts: completed.map((entry) => entry.artifact),
        notes: [
          'All KTX2 files were emitted by the configured Khronos KTX Software executable.',
          'Every output passed KTX2 identifier, byte-length, bridge SHA-256, and independent browser SHA-256 validation.',
          'Compression ratio compares browser-normalized PNG bytes with returned KTX2 bytes; it is not a comparison against the original embedded image payload.',
          'A full mip pyramid was requested during KTX creation.',
          'Rung 10 does not rewrite the source GLB to KHR_texture_basisu bindings.',
          'Basis encoding may differ bit-for-bit across platforms; this receipt binds the exact bytes returned by this execution.',
        ],
      }

      for (const entry of completed) {
        downloadBlob(entry.blob, entry.artifact.outputFilename)
      }

      setTextureEncodingReceipts((current) =>
        [...current, receipt].slice(-50),
      )
      setSessionKtx2Payloads(
        completed.map((entry) => ({
          textureId: entry.artifact.textureId,
          textureName: entry.artifact.name,
          sha256: entry.artifact.outputSha256,
          blob: entry.blob,
        })),
      )
      downloadBlob(
        new Blob([JSON.stringify(receipt, null, 2)], {
          type: 'application/json',
        }),
        `${safeName(artifact.label)}-${audit.profileId}-ktx2-executed.json`,
      )
      setProjectStatus(
        `KTX2 EXECUTED · ${completed.length} TEXTURES · ` +
        `${receipt.aggregateCompressionRatio.toFixed(2)}× PNG/KTX2`,
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Texture encoding failed.',
      )
      setProjectStatus('')
    } finally {
      setTextureEncodingBusy(false)
    }
  }

  const beginBasisuDerivedGlb = () => {
    setError('')
    try {
      const encoding = textureEncodingReceipts.at(-1)
      if (!encoding) {
        throw new Error(
          'Run executed KTX2 compression before building a BasisU GLB.',
        )
      }
      if (
        encoding.sourceArtifactId !== artifact.id ||
        encoding.sourceNodeId !== editGraph.currentNodeId
      ) {
        throw new Error(
          'The latest KTX2 receipt belongs to a different artifact or edit-graph node. Re-run texture encoding for the current state.',
        )
      }
      if (
        sessionKtx2Payloads.length !== encoding.artifacts.length ||
        sessionKtx2Payloads.length === 0
      ) {
        throw new Error(
          'The verified KTX2 bytes are not available in this browser session. Re-run executed texture encoding before deriving the GLB.',
        )
      }
      if (!textureAudit) {
        throw new Error('No current texture audit is available.')
      }

      const encodedIds = new Set(
        encoding.artifacts.map((entry) => entry.textureId),
      )
      const incompatible = textureAudit.textures.filter(
        (entry) =>
          encodedIds.has(entry.id) &&
          (
            entry.width <= 0 ||
            entry.height <= 0 ||
            entry.width % 4 !== 0 ||
            entry.height % 4 !== 0
          ),
      )
      if (incompatible.length > 0) {
        throw new Error(
          'KHR_texture_basisu requires texture dimensions divisible by 4. Re-author or resize: ' +
          incompatible.map((entry) =>
            `${entry.name} (${entry.width}×${entry.height})`
          ).join(', '),
        )
      }

      setBasisuBusy(true)
      setProjectStatus('EXPORTING BASISU SOURCE GLB…')
      setBasisuGlbRequest((value) => value + 1)
    } catch (cause) {
      setBasisuBusy(false)
      setError(
        cause instanceof Error
          ? cause.message
          : 'BasisU GLB derivation could not start.',
      )
    }
  }

  const handleBasisuSourceGlbReady = async (sourceGlb: Blob) => {
    setError('')
    try {
      const encoding = textureEncodingReceipts.at(-1)
      if (!encoding) {
        throw new Error('Executed KTX2 receipt disappeared before GLB rewrite.')
      }

      const sourceBytes = new Uint8Array(await sourceGlb.arrayBuffer())
      const sourceGlbSha256 = await sha256Blob(sourceGlb)
      const verifiedPayloads: VerifiedKtx2Payload[] = []

      for (const payload of sessionKtx2Payloads) {
        const expected = encoding.artifacts.find(
          (entry) => entry.textureId === payload.textureId,
        )
        if (!expected) {
          throw new Error(
            `Session KTX2 payload ${payload.textureName} is not present in the executed receipt.`,
          )
        }
        if (
          payload.sha256 !== expected.outputSha256 ||
          payload.blob.size !== expected.outputByteLength
        ) {
          throw new Error(
            `Session KTX2 evidence changed for ${payload.textureName}.`,
          )
        }
        const actual = await verifyKtx2Blob(
          payload.blob,
          expected.outputSha256,
          expected.outputByteLength,
        )
        verifiedPayloads.push({
          textureId: payload.textureId,
          textureName: payload.textureName,
          sha256: actual,
          bytes: new Uint8Array(await payload.blob.arrayBuffer()),
        })
      }

      const rewritten = rewriteGlbWithBasisu(
        sourceBytes,
        verifiedPayloads,
      )
      const outputBuffer = Uint8Array.from(rewritten.bytes).buffer
      const outputBlob = new Blob(
        [outputBuffer],
        { type: 'model/gltf-binary' },
      )
      const outputGlbSha256 = await sha256Blob(outputBlob)

      const boundIds = new Set(
        rewritten.bindings.map((entry) => entry.textureId),
      )
      const unboundExecutedTextureIds = verifiedPayloads
        .map((entry) => entry.textureId)
        .filter((textureId) => !boundIds.has(textureId))

      const outputFilename =
        `${safeName(artifact.label)}-basisu-fallback.glb`
      const receipt: BasisuDerivedReceipt = {
        schema: 'phiform.basisu-derived-receipt.v1',
        id:
          `basisu-derived-receipt-` +
          (crypto.randomUUID?.() ?? Date.now().toString(36)),
        createdAt: new Date().toISOString(),
        sourceArtifactId: artifact.id,
        sourceNodeId: editGraph.currentNodeId,
        sourceEncodingReceiptId: encoding.id,
        outputFilename,
        sourceGlbSha256,
        sourceGlbByteLength: sourceGlb.size,
        outputGlbSha256,
        outputGlbByteLength: outputBlob.size,
        extensionUsed: 'KHR_texture_basisu',
        extensionRequired: false,
        bindingCoverage:
          unboundExecutedTextureIds.length === 0 &&
          rewritten.fallbackOnlyTextureNames.length === 0
            ? 'full'
            : 'partial',
        boundTextureCount: rewritten.bindings.length,
        fallbackOnlyTextureCount:
          rewritten.fallbackOnlyTextureNames.length,
        unboundExecutedTextureCount:
          unboundExecutedTextureIds.length,
        bindings: rewritten.bindings,
        fallbackOnlyTextureNames:
          rewritten.fallbackOnlyTextureNames,
        unboundExecutedTextureIds,
        notes: [
          'Derived GLB preserves original PNG/JPEG image sources as fallbacks.',
          'KHR_texture_basisu is listed in extensionsUsed but not extensionsRequired.',
          'Verified KTX2 payloads are embedded as image/ktx2 buffer views.',
          'Original workspace artifact is not mutated by this derived export.',
          'Rung 11 does not strip fallback image payloads, so the derived GLB may be larger than the source GLB.',
        ],
      }

      setBasisuDerivedReceipts((current) =>
        [...current, receipt].slice(-50),
      )

      downloadBlob(outputBlob, outputFilename)
      downloadBlob(
        new Blob([JSON.stringify(receipt, null, 2)], {
          type: 'application/json',
        }),
        `${safeName(artifact.label)}-basisu-derived-receipt.json`,
      )

      setProjectStatus(
        `BASISU GLB ${receipt.bindingCoverage.toUpperCase()} · ` +
        `${receipt.boundTextureCount} BOUND · ` +
        `${receipt.fallbackOnlyTextureCount} FALLBACK-ONLY`,
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'BasisU GLB rewrite failed.',
      )
      setProjectStatus('')
    } finally {
      setBasisuBusy(false)
    }
  }

  const recordTextureQualification = () => {
    if (!textureAudit) {
      setError('No texture audit is available for the current scene.')
      return
    }

    const receipt = buildTextureReceipt(
      artifact,
      editGraph.currentNodeId,
      textureAudit,
    )

    setTextureReceipts((current) => [...current, receipt].slice(-50))
    downloadBlob(
      new Blob([JSON.stringify(receipt, null, 2)], {
        type: 'application/json',
      }),
      `${safeName(artifact.label)}-${textureAudit.profileId}-textures.json`,
    )
    setProjectStatus(
      `TEXTURE RECEIPT ${textureAudit.qualification.toUpperCase()} · ${textureAudit.totals.textures} TEXTURES`,
    )
  }

  const handleEngineComplete = async (
    result: EngineRuntimeResult,
  ) => {
    setError('')
    try {
      const baseName = safeName(artifact.label)
      const importScenePath =
        result.engine === 'godot'
          ? 'import/asset-godot.glb'
          : 'import/asset-unreal.glb'

      const inputFiles: EnginePackInputFile[] = [
        {
          path: importScenePath,
          role: 'import-scene' as const,
          bytes: new Uint8Array(await result.importSceneBlob.arrayBuffer()),
        },
        {
          path: 'IMPORT.md',
          role: 'instructions' as const,
          bytes: new TextEncoder().encode(
            engineImportInstructions(result.engine),
          ),
        },
      ]

      const lods = []
      for (const file of result.lodFiles) {
        const path = `models/lod${file.lod}.glb`
        inputFiles.push({
          path,
          role: 'lod',
          bytes: new Uint8Array(await file.blob.arrayBuffer()),
        })
        lods.push({
          lod: file.lod,
          path,
          ratio: file.ratio,
          triangles: file.triangles,
        })
      }

      const built = await buildEnginePack({
        engine: result.engine,
        createdAt: new Date().toISOString(),
        sourceArtifactId: artifact.id,
        sourceNodeId: editGraph.currentNodeId,
        productionProfileId: result.productionProfileId,
        collisionNodeNames: result.collisionNodeNames,
        importScenePath,
        files: inputFiles,
        lods,
        notes: [
          'Package contains standard GLB assets and a PhiForm engine manifest.',
          'Collision proxies use engine-specific naming conventions inside the combined import scene.',
          'LOD files are packaged separately and are not claimed to be auto-wired by the target engine.',
        ],
      })

      const packageFilename = `${baseName}-${result.engine}-engine-pack.zip`
      const packageSha256 = await sha256Bytes(built.zipBytes)

      const receipt: EnginePackReceipt = {
        schema: 'phiform.engine-pack-receipt.v1',
        id: `engine-pack-receipt-${crypto.randomUUID?.() ?? Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        engine: result.engine,
        sourceArtifactId: artifact.id,
        sourceNodeId: editGraph.currentNodeId,
        manifest: built.manifest,
        files: built.fileRecords,
        packageFilename,
        packageByteLength: built.zipBytes.byteLength,
        packageSha256,
      }

      setEnginePackReceipts((current) => [...current, receipt].slice(-50))

      const zipBuffer = Uint8Array.from(built.zipBytes).buffer
      downloadBlob(
        new Blob([zipBuffer], { type: 'application/zip' }),
        packageFilename,
      )

      downloadBlob(
        new Blob([JSON.stringify(receipt, null, 2)], {
          type: 'application/json',
        }),
        `${baseName}-${result.engine}-engine-pack-receipt.json`,
      )

      setProjectStatus(
        `ENGINE PACK ${result.engine.toUpperCase()} · ${built.fileRecords.length} FILES`,
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Engine pack generation failed.',
      )
    } finally {
      setEngineBusy(false)
    }
  }

  const buildEngineAssetPack = () => {
    setEngineBusy(true)
    setProjectStatus('BUILDING ENGINE ASSET PACK…')
    setEngineRequest((value) => value + 1)
  }

  const handleProductionComplete = async (
    result: ProductionRuntimeResult,
  ) => {
    setError('')
    try {
      const profile = productionProfile(result.profileId)
      const files = []

      for (const file of result.files) {
        const filename =
          `${safeName(artifact.label)}-${result.profileId}-lod${file.lod}.glb`
        const sha256 = await sha256Blob(file.blob)
        files.push({
          label: `LOD${file.lod}`,
          filename,
          lod: file.lod,
          ratio: file.ratio,
          triangles: file.audit.totals.triangles,
          byteLength: file.blob.size,
          sha256,
        })
        downloadBlob(file.blob, filename)
      }

      let qualification: ProductionReceipt['qualification'] = 'pass'
      for (const file of result.files) {
        if (file.audit.qualification === 'fail') qualification = 'fail'
        else if (
          qualification === 'pass' &&
          file.audit.qualification === 'warning'
        ) {
          qualification = 'warning'
        }
      }

      if (
        profile.maxTriangles !== null &&
        files[0] &&
        files[0].triangles > profile.maxTriangles &&
        qualification === 'pass'
      ) {
        qualification = 'warning'
      }

      const receipt: ProductionReceipt = {
        schema: 'phiform.production-receipt.v1',
        id: `production-receipt-${crypto.randomUUID?.() ?? Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        sourceArtifactId: artifact.id,
        sourceNodeId: editGraph.currentNodeId,
        profileId: result.profileId,
        qualification,
        before: result.before,
        after: result.files.map((file) => file.audit),
        operations: result.operations,
        files,
      }

      setProductionReceipts((current) => [...current, receipt].slice(-50))

      const manifest = new Blob([JSON.stringify(receipt, null, 2)], {
        type: 'application/json',
      })
      downloadBlob(
        manifest,
        `${safeName(artifact.label)}-${result.profileId}-production.json`,
      )
      setProjectStatus(
        `PRODUCTION PACK ${qualification.toUpperCase()} · ${files.length} GLB`,
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Production receipt generation failed.',
      )
    } finally {
      setProductionBusy(false)
    }
  }

  const buildProductionPack = () => {
    setProductionBusy(true)
    setProjectStatus('BUILDING PRODUCTION PACK…')
    setProductionRequest((value) => value + 1)
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
          <span className="pill"><i /> RUNG 11</span>
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
            productionProfileId={productionProfileId}
            productionRequest={productionRequest}
            engineTarget={engineTarget}
            engineRequest={engineRequest}
            textureProfileId={textureProfileId}
            textureEncodeRequest={textureEncodeRequest}
            basisuGlbRequest={basisuGlbRequest}
            onSelectedChange={setSelected}
            onTargetChange={setTarget}
            onMeshTargetsChange={setMeshTargets}
            onEditsChange={setEdits}
            onStatsChange={setMeshStats}
            onProductionAuditChange={setProductionAudit}
            onTextureAuditChange={setTextureAudit}
            onTextureSourcesReady={(audit, sources) => {
              void handleTextureSourcesReady(audit, sources)
            }}
            onBasisuSourceGlbReady={(blob) => {
              void handleBasisuSourceGlbReady(blob)
            }}
            onExportComplete={(blob) => { void handleEditedExport(blob) }}
            onProductionComplete={(result) => { void handleProductionComplete(result) }}
            onEngineComplete={(result) => { void handleEngineComplete(result) }}
            onError={(message) => {
              setError(message)
              setProductionBusy(false)
              setEngineBusy(false)
              setTextureEncodingBusy(false)
              setBasisuBusy(false)
            }}
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
            <div><span>PROD RECEIPTS</span><strong>{productionReceipts.length}</strong></div>
            <div><span>ENGINE PACKS</span><strong>{enginePackReceipts.length}</strong></div>
            <div><span>TEXTURE RECEIPTS</span><strong>{textureReceipts.length}</strong></div>
            <div><span>KTX2 EXECUTED</span><strong>{textureEncodingReceipts.length}</strong></div>
            <div><span>BASISU GLBS</span><strong>{basisuDerivedReceipts.length}</strong></div>
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

          <ProductionPanel
            profileId={productionProfileId}
            audit={productionAudit}
            receipts={productionReceipts}
            busy={productionBusy}
            onProfileChange={setProductionProfileId}
            onBuild={buildProductionPack}
          />

          <TexturePanel
            profileId={textureProfileId}
            audit={textureAudit}
            receipts={textureReceipts}
            encodingReceipts={textureEncodingReceipts}
            encoder={textureEncoder}
            encoderStatus={textureEncoderStatus}
            encodingBusy={textureEncodingBusy}
            basisuBusy={basisuBusy}
            basisuReceipts={basisuDerivedReceipts}
            basisuSessionReady={
              sessionKtx2Payloads.length > 0 &&
              sessionKtx2Payloads.length ===
                (textureEncodingReceipts.at(-1)?.artifacts.length ?? -1)
            }
            onProfileChange={setTextureProfileId}
            onRecord={recordTextureQualification}
            onProbeEncoder={() => { void probeTextureEncoder() }}
            onExecuteEncoding={() => { void beginTextureEncoding() }}
            onBuildBasisuGlb={beginBasisuDerivedGlb}
          />

          <EnginePackPanel
            engine={engineTarget}
            busy={engineBusy}
            receipts={enginePackReceipts}
            onEngineChange={setEngineTarget}
            onBuild={buildEngineAssetPack}
          />

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
            <span>DERIVED ≠ SOURCE MUTATION</span>
            <p>
              Rung 11 embeds verified KTX2 payloads through KHR_texture_basisu into a
              new fallback-bearing GLB. Original image sources and the editable workspace
              remain untouched.
            </p>
          </div>
        </aside>
      </section>
    </main>
  )
}
