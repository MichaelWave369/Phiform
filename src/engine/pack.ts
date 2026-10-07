import * as THREE from 'three'
import { strToU8, unzipSync, zipSync } from 'fflate'
import type {
  EnginePackManifest,
  EnginePackFile,
  EngineTarget,
  ProductionProfileId,
} from '../core/types'

const FIXED_ZIP_TIME = new Date('1980-01-01T00:00:00.000Z')

export function engineProfileId(engine: EngineTarget): ProductionProfileId {
  return engine === 'godot' ? 'godot-game' : 'unreal-game'
}

export function sanitizeEngineName(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'PhiFormAsset'
}

export function collisionNodeName(
  engine: EngineTarget,
  renderMeshName: string,
): string {
  const safe = sanitizeEngineName(renderMeshName)
  return engine === 'godot'
    ? `${safe}-convcolonly`
    : `UBX_${safe}_00`
}

function cloneMaterials(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material)
    ? material.map((entry) => entry.clone())
    : material.clone()
}

export function cloneObjectForEngine(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true)
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry = child.geometry.clone()
    child.material = cloneMaterials(child.material)
  })
  return clone
}

export interface EngineImportScene {
  scene: THREE.Group
  collisionNames: string[]
}

export function buildEngineImportScene(
  source: THREE.Object3D,
  engine: EngineTarget,
  assetLabel: string,
): EngineImportScene {
  source.updateMatrixWorld(true)
  const visual = cloneObjectForEngine(source)
  visual.updateMatrixWorld(true)

  const sourceMeshes: THREE.Mesh[] = []
  source.traverse((child) => {
    if (child instanceof THREE.Mesh) sourceMeshes.push(child)
  })

  const visualMeshes: THREE.Mesh[] = []
  visual.traverse((child) => {
    if (child instanceof THREE.Mesh) visualMeshes.push(child)
  })

  const root = new THREE.Group()
  root.name = sanitizeEngineName(assetLabel)
  root.add(visual)

  const collisionMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    wireframe: true,
  })
  const collisionNames: string[] = []

  sourceMeshes.forEach((sourceMesh, index) => {
    const visualMesh = visualMeshes[index]
    if (!visualMesh) return

    const renderName = sanitizeEngineName(
      sourceMesh.name || `${assetLabel}_Mesh_${index + 1}`,
    )
    visualMesh.name = renderName

    const box = new THREE.Box3().setFromObject(sourceMesh)
    if (box.isEmpty()) return

    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(center)

    if (
      !Number.isFinite(size.x) ||
      !Number.isFinite(size.y) ||
      !Number.isFinite(size.z) ||
      size.x <= 0 ||
      size.y <= 0 ||
      size.z <= 0
    ) {
      return
    }

    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      collisionMaterial.clone(),
    )
    proxy.position.copy(center)
    proxy.name = collisionNodeName(engine, renderName)
    proxy.userData.phiformCollisionProxy = true
    proxy.userData.phiformCollisionKind = 'box'
    root.add(proxy)
    collisionNames.push(proxy.name)
  })

  return { scene: root, collisionNames }
}

export function disposeEngineScene(scene: THREE.Object3D) {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry.dispose()
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]
    materials.forEach((material) => material.dispose())
  })
}

export function engineImportInstructions(engine: EngineTarget): string {
  if (engine === 'godot') {
    return [
      '# PhiForm Godot Import',
      '',
      'Primary import scene: import/asset-godot.glb',
      '',
      'Godot supports glTF/GLB scene import.',
      'Collision proxies in the import scene use the -convcolonly suffix.',
      'Keep node-name suffix processing enabled for automatic collision conversion.',
      'LOD GLBs are included separately under models/ and are listed in the manifest.',
      'PhiForm does not claim that Godot automatically wires those external LOD files.',
      '',
      'Coordinate convention: glTF 2.0, right-handed, +Y up, +Z forward, meters.',
    ].join('\n')
  }

  return [
    '# PhiForm Unreal Import',
    '',
    'Primary import scene: import/asset-unreal.glb',
    '',
    'Unreal Interchange supports glTF/GLB import.',
    'Collision proxies in the import scene use UBX_<RenderMeshName>_00 naming.',
    'Use an import mode that recognizes collision meshes by name.',
    'LOD GLBs are included separately under models/ and are listed in the manifest.',
    'PhiForm does not claim to generate native .uasset files or automatically assign imported LODs.',
    '',
    'Coordinate convention inside the source GLB: glTF 2.0, right-handed, +Y up, +Z forward, meters.',
  ].join('\n')
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256Blob(blob: Blob): Promise<string> {
  return sha256Bytes(new Uint8Array(await blob.arrayBuffer()))
}

export interface EnginePackInputFile {
  path: string
  role: EnginePackFile['role']
  bytes: Uint8Array
}

export interface EnginePackBuildInput {
  engine: EngineTarget
  createdAt: string
  sourceArtifactId: string
  sourceNodeId: string
  productionProfileId: ProductionProfileId
  collisionNodeNames: string[]
  importScenePath: string
  files: EnginePackInputFile[]
  lods: Array<{
    lod: number
    path: string
    ratio: number
    triangles: number
  }>
  notes: string[]
}

export interface BuiltEnginePack {
  manifest: EnginePackManifest
  fileRecords: EnginePackFile[]
  zipBytes: Uint8Array
}

export async function buildEnginePack(
  input: EnginePackBuildInput,
): Promise<BuiltEnginePack> {
  const sortedFiles = [...input.files].sort((a, b) =>
    a.path.localeCompare(b.path),
  )

  const fileRecords: EnginePackFile[] = []
  const hashByPath = new Map<string, string>()

  for (const file of sortedFiles) {
    const sha256 = await sha256Bytes(file.bytes)
    hashByPath.set(file.path, sha256)
    fileRecords.push({
      path: file.path,
      role: file.role,
      byteLength: file.bytes.byteLength,
      sha256,
    })
  }

  const manifest: EnginePackManifest = {
    schema: 'phiform.engine-pack.v1',
    createdAt: input.createdAt,
    engine: input.engine,
    sourceArtifactId: input.sourceArtifactId,
    sourceNodeId: input.sourceNodeId,
    productionProfileId: input.productionProfileId,
    coordinates: {
      standard: 'glTF 2.0',
      handedness: 'right',
      upAxis: '+Y',
      forwardAxis: '+Z',
      linearUnit: 'meter',
    },
    collision: {
      kind: 'box',
      nodeNames: [...input.collisionNodeNames],
      embeddedInImportScene: true,
    },
    lods: input.lods.map((lod) => ({
      ...lod,
      sha256: hashByPath.get(lod.path) ?? '',
    })),
    importScenePath: input.importScenePath,
    notes: [...input.notes],
  }

  const manifestPath = 'phiform-engine-manifest.json'
  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2))
  const manifestHash = await sha256Bytes(manifestBytes)
  fileRecords.push({
    path: manifestPath,
    role: 'manifest',
    byteLength: manifestBytes.byteLength,
    sha256: manifestHash,
  })

  const zipInput: Record<string, [Uint8Array, { level: 0 | 6; mtime: Date }]> = {}
  for (const file of sortedFiles) {
    const level = file.path.endsWith('.glb') ? 0 : 6
    zipInput[file.path] = [
      file.bytes,
      { level, mtime: FIXED_ZIP_TIME },
    ]
  }
  zipInput[manifestPath] = [
    manifestBytes,
    { level: 6, mtime: FIXED_ZIP_TIME },
  ]

  const zipBytes = zipSync(zipInput, {
    level: 6,
    mtime: FIXED_ZIP_TIME,
  })

  return {
    manifest,
    fileRecords: fileRecords.sort((a, b) => a.path.localeCompare(b.path)),
    zipBytes,
  }
}

export function inspectEngineZip(bytes: Uint8Array): string[] {
  return Object.keys(unzipSync(bytes)).sort()
}
