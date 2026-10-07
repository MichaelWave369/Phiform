import * as THREE from 'three'
import { SimplifyModifier } from 'three/addons/modifiers/SimplifyModifier.js'
import type {
  GeometryAudit,
  ProductionAudit,
} from '../core/types'
import type { ProductionProfile } from './profiles'

const AREA_EPSILON = 1e-18
const POSITION_QUANTIZATION = 1e6

function quantized(value: number): number {
  return Math.round(value * POSITION_QUANTIZATION)
}

function vertexKey(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
): string {
  return [
    quantized(position.getX(index)),
    quantized(position.getY(index)),
    quantized(position.getZ(index)),
  ].join(',')
}

function triangleIndices(
  geometry: THREE.BufferGeometry,
  triangle: number,
): [number, number, number] {
  const offset = triangle * 3
  const index = geometry.getIndex()
  return index
    ? [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
    : [offset, offset + 1, offset + 2]
}

function triangleAreaSquared(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  a: number,
  b: number,
  c: number,
): number {
  const ax = position.getX(a)
  const ay = position.getY(a)
  const az = position.getZ(a)
  const abx = position.getX(b) - ax
  const aby = position.getY(b) - ay
  const abz = position.getZ(b) - az
  const acx = position.getX(c) - ax
  const acy = position.getY(c) - ay
  const acz = position.getZ(c) - az
  const cx = aby * acz - abz * acy
  const cy = abz * acx - abx * acz
  const cz = abx * acy - aby * acx
  return cx * cx + cy * cy + cz * cz
}

function finiteAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
): boolean {
  if (!attribute) return false
  for (let index = 0; index < attribute.count; index += 1) {
    for (let component = 0; component < attribute.itemSize; component += 1) {
      if (!Number.isFinite(attribute.getComponent(index, component))) return false
    }
  }
  return true
}

function materialForIndexOffset(
  groups: readonly { start: number; count: number; materialIndex?: number }[],
  offset: number,
): number {
  const group = groups.find(
    (candidate) =>
      offset >= candidate.start &&
      offset < candidate.start + candidate.count,
  )
  return group?.materialIndex ?? 0
}

export function auditGeometry(
  geometry: THREE.BufferGeometry,
  meshId = 'mesh',
  name = 'Mesh',
): GeometryAudit {
  const position = geometry.getAttribute('position')
  if (!position || position.itemSize < 3) {
    return {
      meshId,
      name,
      vertices: 0,
      triangles: 0,
      indexed: geometry.getIndex() !== null,
      normalsPresent: false,
      normalsFinite: false,
      uvsPresent: false,
      uvsFinite: false,
      invalidVertices: 0,
      degenerateTriangles: 0,
      boundaryEdges: 0,
      nonManifoldEdges: 0,
    }
  }

  let invalidVertices = 0
  for (let index = 0; index < position.count; index += 1) {
    if (
      !Number.isFinite(position.getX(index)) ||
      !Number.isFinite(position.getY(index)) ||
      !Number.isFinite(position.getZ(index))
    ) {
      invalidVertices += 1
    }
  }

  const triangleCount = geometry.getIndex()
    ? Math.floor(geometry.getIndex()!.count / 3)
    : Math.floor(position.count / 3)

  let degenerateTriangles = 0
  const edgeUse = new Map<string, number>()

  const addEdge = (left: string, right: string) => {
    const key = left < right ? `${left}|${right}` : `${right}|${left}`
    edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1)
  }

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const [a, b, c] = triangleIndices(geometry, triangle)
    const ka = vertexKey(position, a)
    const kb = vertexKey(position, b)
    const kc = vertexKey(position, c)
    if (
      ka === kb ||
      kb === kc ||
      kc === ka ||
      triangleAreaSquared(position, a, b, c) <= AREA_EPSILON
    ) {
      degenerateTriangles += 1
    }

    addEdge(ka, kb)
    addEdge(kb, kc)
    addEdge(kc, ka)
  }

  let boundaryEdges = 0
  let nonManifoldEdges = 0
  for (const count of edgeUse.values()) {
    if (count === 1) boundaryEdges += 1
    if (count > 2) nonManifoldEdges += 1
  }

  const normal = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')

  return {
    meshId,
    name,
    vertices: position.count,
    triangles: triangleCount,
    indexed: geometry.getIndex() !== null,
    normalsPresent: Boolean(normal && normal.count === position.count),
    normalsFinite: Boolean(
      normal &&
      normal.count === position.count &&
      finiteAttribute(normal),
    ),
    uvsPresent: Boolean(uv && uv.count === position.count),
    uvsFinite: Boolean(
      uv &&
      uv.count === position.count &&
      finiteAttribute(uv),
    ),
    invalidVertices,
    degenerateTriangles,
    boundaryEdges,
    nonManifoldEdges,
  }
}

export function auditObject(
  object: THREE.Object3D,
  requireUvs = false,
): ProductionAudit {
  const meshes: GeometryAudit[] = []
  let fallback = 0

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const meshId = String(
      child.userData.phiformMeshId ||
      `mesh-${String(fallback).padStart(3, '0')}`,
    )
    const name = String(
      child.userData.phiformMeshName ||
      child.name ||
      `Mesh ${fallback + 1}`,
    )
    meshes.push(auditGeometry(child.geometry, meshId, name))
    fallback += 1
  })

  const totals = meshes.reduce(
    (current, mesh) => ({
      meshes: current.meshes + 1,
      vertices: current.vertices + mesh.vertices,
      triangles: current.triangles + mesh.triangles,
      invalidVertices: current.invalidVertices + mesh.invalidVertices,
      degenerateTriangles:
        current.degenerateTriangles + mesh.degenerateTriangles,
      boundaryEdges: current.boundaryEdges + mesh.boundaryEdges,
      nonManifoldEdges:
        current.nonManifoldEdges + mesh.nonManifoldEdges,
      meshesMissingNormals:
        current.meshesMissingNormals +
        (mesh.normalsPresent && mesh.normalsFinite ? 0 : 1),
      meshesMissingUvs:
        current.meshesMissingUvs +
        (mesh.uvsPresent && mesh.uvsFinite ? 0 : 1),
    }),
    {
      meshes: 0,
      vertices: 0,
      triangles: 0,
      invalidVertices: 0,
      degenerateTriangles: 0,
      boundaryEdges: 0,
      nonManifoldEdges: 0,
      meshesMissingNormals: 0,
      meshesMissingUvs: 0,
    },
  )

  const notes: string[] = []
  let qualification: ProductionAudit['qualification'] = 'pass'

  if (totals.invalidVertices > 0) {
    qualification = 'fail'
    notes.push('Non-finite vertex positions detected.')
  }
  if (totals.nonManifoldEdges > 0) {
    qualification = 'fail'
    notes.push('Edges shared by more than two triangles were detected.')
  }
  if (totals.degenerateTriangles > 0) {
    if (qualification === 'pass') qualification = 'warning'
    notes.push('Degenerate triangles were detected.')
  }
  if (totals.boundaryEdges > 0) {
    if (qualification === 'pass') qualification = 'warning'
    notes.push('Open boundary edges were detected; watertightness is not proven.')
  }
  if (totals.meshesMissingNormals > 0) {
    if (qualification === 'pass') qualification = 'warning'
    notes.push('One or more meshes have missing or non-finite normals.')
  }
  if (requireUvs && totals.meshesMissingUvs > 0) {
    if (qualification === 'pass') qualification = 'warning'
    notes.push('The selected profile expects UVs, but one or more meshes lack valid UVs.')
  }
  if (notes.length === 0) {
    notes.push('No audited geometry defects were detected by the current checks.')
  }

  return { meshes, totals, qualification, notes }
}

function dropIndexedDegenerateTriangles(
  geometry: THREE.BufferGeometry,
): { geometry: THREE.BufferGeometry; removed: number; supported: boolean } {
  const index = geometry.getIndex()
  const position = geometry.getAttribute('position')
  if (!index || !position) {
    return { geometry: geometry.clone(), removed: 0, supported: false }
  }

  const kept: number[] = []
  const groups: Array<{ start: number; count: number; materialIndex: number }> = []
  let removed = 0

  const appendGroup = (materialIndex: number) => {
    const previous = groups.at(-1)
    if (previous && previous.materialIndex === materialIndex) {
      previous.count += 3
      return
    }
    groups.push({ start: kept.length - 3, count: 3, materialIndex })
  }

  const triangles = Math.floor(index.count / 3)
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const offset = triangle * 3
    const a = index.getX(offset)
    const b = index.getX(offset + 1)
    const c = index.getX(offset + 2)
    const ka = vertexKey(position, a)
    const kb = vertexKey(position, b)
    const kc = vertexKey(position, c)
    const degenerate =
      ka === kb ||
      kb === kc ||
      kc === ka ||
      triangleAreaSquared(position, a, b, c) <= AREA_EPSILON

    if (degenerate) {
      removed += 1
      continue
    }

    kept.push(a, b, c)
    appendGroup(materialForIndexOffset(geometry.groups, offset))
  }

  const clone = geometry.clone()
  clone.setIndex(kept)
  clone.clearGroups()
  for (const group of groups) {
    clone.addGroup(group.start, group.count, group.materialIndex)
  }
  return { geometry: clone, removed, supported: true }
}

function cloneObjectForProduction(object: THREE.Object3D): THREE.Object3D {
  const clone = object.clone(true)
  clone.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    child.geometry = child.geometry.clone()
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone())
    } else {
      child.material = child.material.clone()
    }
  })
  return clone
}

async function simplifyObject(
  object: THREE.Object3D,
  ratio: number,
  operations: string[],
) {
  if (ratio >= 0.999) return
  const modifier = new SimplifyModifier()
  const tasks: Promise<void>[] = []

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return

    if (
      child instanceof THREE.SkinnedMesh ||
      child.geometry.groups.length > 1 ||
      Object.keys(child.geometry.morphAttributes).length > 0
    ) {
      operations.push(
        `Skipped simplification for ${child.name || 'mesh'} because skinned, multi-material, or morph geometry is preserved.`,
      )
      return
    }

    const position = child.geometry.getAttribute('position')
    if (!position || position.count < 8) return

    const removeCount = Math.floor(position.count * (1 - ratio))
    if (removeCount <= 0) return

    tasks.push(
      Promise.resolve(modifier.modify(child.geometry, removeCount)).then(
        (simplified: THREE.BufferGeometry) => {
          child.geometry.dispose()
          child.geometry = simplified
        },
      ),
    )
  })

  await Promise.all(tasks)
}

export interface PreparedProductionVariant {
  lod: number
  ratio: number
  object: THREE.Object3D
  audit: ProductionAudit
  operations: string[]
}

export async function prepareProductionVariants(
  source: THREE.Object3D,
  profile: ProductionProfile,
): Promise<{
  before: ProductionAudit
  variants: PreparedProductionVariant[]
  operations: string[]
}> {
  const before = auditObject(source, profile.requireUvs)
  const baseRatio =
    profile.maxTriangles && before.totals.triangles > profile.maxTriangles
      ? profile.maxTriangles / Math.max(before.totals.triangles, 1)
      : 1

  const variants: PreparedProductionVariant[] = []
  const globalOperations: string[] = []

  for (let lod = 0; lod < profile.lodRatios.length; lod += 1) {
    const requestedRatio = Math.max(
      0.05,
      Math.min(1, baseRatio * profile.lodRatios[lod]),
    )
    const object = cloneObjectForProduction(source)
    const operations: string[] = []

    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return

      if (profile.dropDegenerateTriangles) {
        const result = dropIndexedDegenerateTriangles(child.geometry)
        if (result.supported) {
          child.geometry.dispose()
          child.geometry = result.geometry
          if (result.removed > 0) {
            operations.push(
              `Removed ${result.removed} indexed degenerate triangles from ${child.name || 'mesh'}.`,
            )
          }
        } else {
          operations.push(
            `Degenerate-triangle removal skipped for non-indexed ${child.name || 'mesh'}; diagnostics remain authoritative.`,
          )
        }
      }

      if (profile.recomputeNormals) {
        child.geometry.computeVertexNormals()
        operations.push(
          `Recomputed vertex normals for ${child.name || 'mesh'}.`,
        )
      }
    })

    await simplifyObject(object, requestedRatio, operations)
    const audit = auditObject(object, profile.requireUvs)
    variants.push({
      lod,
      ratio: requestedRatio,
      object,
      audit,
      operations,
    })
    globalOperations.push(
      `Prepared LOD${lod} at requested ratio ${requestedRatio.toFixed(3)}.`,
      ...operations,
    )
  }

  return { before, variants, operations: globalOperations }
}
