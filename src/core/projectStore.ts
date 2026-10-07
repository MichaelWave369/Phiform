import { createEditGraph } from './editGraph'
import type {
  AgentAuditReceipt,
  EditGraph,
  GenerationReceipt,
  ModelArtifact,
  PortableProject,
  PortableProjectV1,
  PortableProjectV2,
  PortableProjectV3,
  PortableProjectV4,
  ProductionReceipt,
  WorkspaceEditState,
} from './types'

const DB_NAME = 'phiform-workspace'
const STORE_NAME = 'projects'
const LAST_PROJECT = 'last'

type AnyProject =
  | PortableProjectV1
  | PortableProjectV2
  | PortableProjectV3
  | PortableProjectV4

interface StoredProjectRecord {
  key: string
  project: AnyProject
  glb?: ArrayBuffer
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function fetchGlb(artifact: ModelArtifact): Promise<ArrayBuffer | undefined> {
  if (artifact.kind !== 'glb') return undefined
  const response = await fetch(artifact.url)
  if (!response.ok) {
    throw new Error(`Could not persist GLB bytes: HTTP ${response.status}`)
  }
  return response.arrayBuffer()
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function manifestArtifact(artifact: ModelArtifact): ModelArtifact {
  if (artifact.kind !== 'glb') return artifact
  return { ...artifact, url: 'phiform://embedded/model.glb' }
}

function normalizeProject(project: AnyProject): PortableProject {
  if (project.schema === 'phiform.project.v4') {
    if (project.editGraph?.schema !== 'phiform.edit-graph.v1') {
      throw new Error('PhiForm project v4 is missing a valid edit graph.')
    }
    if (!Array.isArray(project.agentReceipts)) {
      throw new Error('PhiForm project v4 is missing its agent audit array.')
    }
    if (!Array.isArray(project.productionReceipts)) {
      throw new Error('PhiForm project v4 is missing its production receipt array.')
    }
    return project
  }

  if (project.schema === 'phiform.project.v3') {
    if (project.editGraph?.schema !== 'phiform.edit-graph.v1') {
      throw new Error('PhiForm project v3 is missing a valid edit graph.')
    }
    return {
      schema: 'phiform.project.v4',
      savedAt: project.savedAt,
      artifact: project.artifact,
      edits: project.edits,
      editGraph: project.editGraph,
      agentReceipts: project.agentReceipts,
      productionReceipts: [],
      latestReceipt: project.latestReceipt,
      glbBase64: project.glbBase64,
    }
  }

  if (project.schema === 'phiform.project.v2') {
    if (project.editGraph?.schema !== 'phiform.edit-graph.v1') {
      throw new Error('PhiForm project v2 is missing a valid edit graph.')
    }
    return {
      schema: 'phiform.project.v4',
      savedAt: project.savedAt,
      artifact: project.artifact,
      edits: project.edits,
      editGraph: project.editGraph,
      agentReceipts: [],
      productionReceipts: [],
      latestReceipt: project.latestReceipt,
      glbBase64: project.glbBase64,
    }
  }

  return {
    schema: 'phiform.project.v4',
    savedAt: project.savedAt,
    artifact: project.artifact,
    edits: project.edits,
    editGraph: createEditGraph(project.artifact, project.edits, project.latestReceipt),
    agentReceipts: [],
    productionReceipts: [],
    latestReceipt: project.latestReceipt,
    glbBase64: project.glbBase64,
  }
}

function hydrateProject(input: AnyProject, glb?: ArrayBuffer): PortableProject {
  const project = normalizeProject(input)
  if (project.artifact.kind !== 'glb') return project
  if (!glb) {
    throw new Error('Project references a GLB artifact but contains no persisted bytes.')
  }

  const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
  return {
    ...project,
    artifact: {
      ...project.artifact,
      url,
      byteLength: glb.byteLength,
    },
  }
}

export async function saveProjectToBrowser(
  artifact: ModelArtifact,
  edits: WorkspaceEditState,
  editGraph: EditGraph,
  agentReceipts: readonly AgentAuditReceipt[],
  productionReceipts: readonly ProductionReceipt[],
  latestReceipt?: GenerationReceipt,
): Promise<void> {
  const glb = await fetchGlb(artifact)
  const project: PortableProject = {
    schema: 'phiform.project.v4',
    savedAt: new Date().toISOString(),
    artifact: manifestArtifact(artifact),
    edits,
    editGraph,
    agentReceipts: [...agentReceipts],
    productionReceipts: [...productionReceipts],
    latestReceipt,
  }

  const db = await openDb()
  try {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    await requestResult(
      store.put({ key: LAST_PROJECT, project, glb } satisfies StoredProjectRecord),
    )
  } finally {
    db.close()
  }
}

export async function loadProjectFromBrowser(): Promise<PortableProject> {
  const db = await openDb()
  try {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const record = await requestResult(
      store.get(LAST_PROJECT) as IDBRequest<StoredProjectRecord | undefined>,
    )
    if (!record) throw new Error('No saved PhiForm project was found in this browser.')
    return hydrateProject(record.project, record.glb)
  } finally {
    db.close()
  }
}

export async function createPortableProject(
  artifact: ModelArtifact,
  edits: WorkspaceEditState,
  editGraph: EditGraph,
  agentReceipts: readonly AgentAuditReceipt[],
  productionReceipts: readonly ProductionReceipt[],
  latestReceipt?: GenerationReceipt,
): Promise<PortableProject> {
  const glb = await fetchGlb(artifact)
  return {
    schema: 'phiform.project.v4',
    savedAt: new Date().toISOString(),
    artifact: manifestArtifact(artifact),
    edits,
    editGraph,
    agentReceipts: [...agentReceipts],
    productionReceipts: [...productionReceipts],
    latestReceipt,
    glbBase64: glb ? arrayBufferToBase64(glb) : undefined,
  }
}

export function downloadPortableProject(project: PortableProject): void {
  const safeName = project.artifact.label
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'phiform-project'

  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${safeName}.phiform.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function readPortableProject(file: File): Promise<PortableProject> {
  const parsed = JSON.parse(await file.text()) as Partial<AnyProject>
  if (
    (parsed.schema !== 'phiform.project.v1' &&
      parsed.schema !== 'phiform.project.v2' &&
      parsed.schema !== 'phiform.project.v3' &&
      parsed.schema !== 'phiform.project.v4') ||
    !parsed.artifact ||
    !parsed.edits
  ) {
    throw new Error('This file is not a supported PhiForm project manifest.')
  }

  const project = normalizeProject(parsed as AnyProject)

  if (project.artifact.kind === 'glb') {
    if (!project.glbBase64) {
      throw new Error('Portable GLB project is missing embedded model bytes.')
    }
    return hydrateProject(project, base64ToArrayBuffer(project.glbBase64))
  }

  return project
}
