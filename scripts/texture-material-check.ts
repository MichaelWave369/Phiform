import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  auditTextures,
  buildTextureReceipt,
  compressionPlan,
} from '../src/texture/audit'
import type { ModelArtifact } from '../src/core/types'

function texture(
  name: string,
  width: number,
  height: number,
  colorSpace: THREE.ColorSpace,
) {
  const result = new THREE.DataTexture(
    new Uint8Array([255, 255, 255, 255]),
    width,
    height,
  )
  result.name = name
  result.colorSpace = colorSpace
  result.generateMipmaps = true
  return result
}

const root = new THREE.Group()

const base = texture('BaseColor', 1024, 1024, THREE.SRGBColorSpace)
const normal = texture('Normal', 1024, 1024, THREE.NoColorSpace)
const orm = texture('ORM', 4096, 4096, THREE.NoColorSpace)

const pbr = new THREE.MeshStandardMaterial()
pbr.name = 'Packed PBR'
pbr.map = base
pbr.normalMap = normal
pbr.roughnessMap = orm
pbr.metalnessMap = orm
pbr.aoMap = orm

const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), pbr)
root.add(mesh)

const noTextureMaterial = new THREE.MeshStandardMaterial()
noTextureMaterial.name = 'No Maps'
root.add(
  new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    noTextureMaterial,
  ),
)

const gameAudit = auditTextures(root, 'game-textures')
assert.equal(gameAudit.totals.textures, 3)
assert.equal(gameAudit.totals.materials, 2)
assert.equal(gameAudit.totals.packedOrmMaterials, 1)
assert.equal(gameAudit.totals.materialsWithoutTextures, 1)
assert.equal(gameAudit.totals.colorSpaceMismatches, 0)
assert.equal(gameAudit.totals.oversizedTextures, 0)
assert.equal(gameAudit.qualification, 'pass')

const ormEntry = gameAudit.textures.find((entry) => entry.name === 'ORM')
assert.ok(ormEntry)
assert.deepEqual(
  ormEntry?.roles,
  ['metalness', 'occlusion', 'roughness'],
)
assert.equal(ormEntry?.expectedColorSpaces[0], 'linear')

const plan = compressionPlan(gameAudit)
assert.equal(
  plan.find((entry) => entry.textureId === normal.uuid)?.mode,
  'uastc',
)
assert.equal(
  plan.find((entry) => entry.textureId === base.uuid)?.mode,
  'etc1s',
)
assert.ok(
  plan.every((entry) => entry.status === 'planned-not-executed'),
)

const webAudit = auditTextures(root, 'web-textures')
assert.equal(webAudit.totals.oversizedTextures, 1)
assert.equal(webAudit.qualification, 'warning')

const conflict = texture(
  'Impossible Shared Texture',
  512,
  512,
  THREE.SRGBColorSpace,
)
const conflictMaterial = new THREE.MeshStandardMaterial()
conflictMaterial.map = conflict
conflictMaterial.normalMap = conflict

const conflictRoot = new THREE.Group()
conflictRoot.add(
  new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    conflictMaterial,
  ),
)
const conflictAudit = auditTextures(conflictRoot, 'game-textures')
assert.equal(conflictAudit.totals.textures, 1)
assert.equal(conflictAudit.qualification, 'fail')
assert.equal(conflictAudit.totals.colorSpaceMismatches, 1)
assert.ok(
  conflictAudit.notes.some((note) =>
    note.includes('incompatible sRGB and linear-data roles'),
  ),
)

const artifact: ModelArtifact = {
  kind: 'primitive',
  id: 'artifact-texture-contract',
  label: 'Texture Contract',
  primitive: 'cube',
  seed: 369,
  scale: [1, 1, 1],
  material: { metalness: 0.2, roughness: 0.5 },
  createdAt: '2026-10-06T00:00:00.000Z',
}
const receipt = buildTextureReceipt(
  artifact,
  'node-texture-contract',
  gameAudit,
  '2026-10-06T00:01:00.000Z',
)
assert.equal(receipt.schema, 'phiform.texture-receipt.v1')
assert.equal(receipt.compressionExecuted, false)
assert.equal(receipt.compressionPlan.length, 3)
assert.equal(receipt.sourceNodeId, 'node-texture-contract')

for (const child of root.children) {
  if (child instanceof THREE.Mesh) {
    child.geometry.dispose()
    child.material.dispose()
  }
}
for (const child of conflictRoot.children) {
  if (child instanceof THREE.Mesh) {
    child.geometry.dispose()
    child.material.dispose()
  }
}
base.dispose()
normal.dispose()
orm.dispose()
conflict.dispose()

process.stdout.write(
  [
    'PASS unique texture deduplication',
    'PASS packed ORM recognition',
    'PASS game profile qualification',
    'PASS web dimension warning',
    'PASS conflicting sRGB/linear role failure',
    'PASS UASTC normal-map planning',
    'PASS ETC1S color/scalar planning',
    'PASS receipt keeps compression unexecuted',
  ].join('\n') + '\n',
)
