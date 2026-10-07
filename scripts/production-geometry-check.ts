import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  auditGeometry,
  auditObject,
  prepareProductionVariants,
} from '../src/production/geometry'
import { productionProfile } from '../src/production/profiles'

const closed = new THREE.BoxGeometry(1, 1, 1)
const closedAudit = auditGeometry(closed, 'mesh-box', 'Box')
assert.equal(closedAudit.invalidVertices, 0)
assert.equal(closedAudit.degenerateTriangles, 0)
assert.equal(closedAudit.nonManifoldEdges, 0)
assert.equal(closedAudit.boundaryEdges, 0)
assert.equal(closedAudit.normalsPresent, true)
assert.equal(closedAudit.uvsPresent, true)

const open = new THREE.BufferGeometry()
open.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(
    [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ],
    3,
  ),
)
open.setIndex([0, 1, 2])
const openAudit = auditGeometry(open, 'mesh-open', 'Open Triangle')
assert.equal(openAudit.boundaryEdges, 3)
assert.equal(openAudit.nonManifoldEdges, 0)

const degenerate = new THREE.BufferGeometry()
degenerate.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(
    [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      2, 0, 0,
    ],
    3,
  ),
)
degenerate.setIndex([
  0, 1, 2,
  1, 3, 3,
])
const degenerateAudit = auditGeometry(
  degenerate,
  'mesh-degenerate',
  'Degenerate',
)
assert.equal(degenerateAudit.degenerateTriangles, 1)

const nonManifold = new THREE.BufferGeometry()
nonManifold.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(
    [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, -1, 0,
      0, 0, 1,
    ],
    3,
  ),
)
nonManifold.setIndex([
  0, 1, 2,
  1, 0, 3,
  0, 1, 4,
])
const nonManifoldAudit = auditGeometry(
  nonManifold,
  'mesh-nonmanifold',
  'Non-Manifold',
)
assert.ok(nonManifoldAudit.nonManifoldEdges >= 1)

const repairGeometry = new THREE.BufferGeometry()
repairGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(
    [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1, 1, 0,
    ],
    3,
  ),
)
repairGeometry.setAttribute(
  'uv',
  new THREE.Float32BufferAttribute(
    [
      0, 0,
      1, 0,
      0, 1,
      1, 1,
    ],
    2,
  ),
)
repairGeometry.setIndex([
  0, 1, 2,
  1, 3, 2,
  0, 0, 1,
])
const repairMesh = new THREE.Mesh(
  repairGeometry,
  new THREE.MeshStandardMaterial(),
)
repairMesh.name = 'Repair Candidate'
repairMesh.userData.phiformMeshId = 'mesh-000'
const root = new THREE.Group()
root.add(repairMesh)

const before = auditObject(root, true)
assert.equal(before.totals.degenerateTriangles, 1)
assert.equal(before.totals.meshesMissingNormals, 1)

const prepared = await prepareProductionVariants(
  root,
  productionProfile('web-balanced'),
)
assert.equal(prepared.before.totals.degenerateTriangles, 1)
assert.equal(prepared.variants.length, 3)
assert.equal(prepared.variants[0].audit.totals.degenerateTriangles, 0)
assert.equal(prepared.variants[0].audit.totals.meshesMissingNormals, 0)
assert.ok(
  prepared.operations.some((note) => note.includes('Removed 1 indexed degenerate')),
)
assert.ok(
  prepared.operations.some((note) => note.includes('Recomputed vertex normals')),
)

const failRoot = new THREE.Group()
failRoot.add(
  new THREE.Mesh(
    nonManifold,
    new THREE.MeshStandardMaterial(),
  ),
)
const failAudit = auditObject(failRoot)
assert.equal(failAudit.qualification, 'fail')

for (const variant of prepared.variants) {
  variant.object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

closed.dispose()
open.dispose()
degenerate.dispose()
nonManifold.dispose()
repairGeometry.dispose()

process.stdout.write(
  [
    'PASS closed-box topology audit',
    'PASS open-boundary detection',
    'PASS degenerate triangle detection',
    'PASS non-manifold edge detection',
    'PASS conservative degenerate removal',
    'PASS normal recomputation',
    'PASS production qualification severity',
    `PASS generated LOD variants: ${prepared.variants.length}`,
  ].join('\n') + '\n',
)
