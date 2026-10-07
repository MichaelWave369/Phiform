import assert from 'node:assert/strict'
import * as THREE from 'three'
import { strFromU8, unzipSync } from 'fflate'
import {
  buildEngineImportScene,
  buildEnginePack,
  collisionNodeName,
  disposeEngineScene,
  engineImportInstructions,
  engineProfileId,
  inspectEngineZip,
  sanitizeEngineName,
  sha256Bytes,
} from '../src/engine/pack'

assert.equal(sanitizeEngineName('  Portal Handle!  '), 'Portal_Handle')
assert.equal(collisionNodeName('godot', 'Portal Handle'), 'Portal_Handle-convcolonly')
assert.equal(collisionNodeName('unreal', 'Portal Handle'), 'UBX_Portal_Handle_00')
assert.equal(engineProfileId('godot'), 'godot-game')
assert.equal(engineProfileId('unreal'), 'unreal-game')

const source = new THREE.Group()

const body = new THREE.Mesh(
  new THREE.BoxGeometry(2, 1, 1),
  new THREE.MeshStandardMaterial(),
)
body.name = 'Body Shell'
body.position.set(0.5, 0, 0)
source.add(body)

const handle = new THREE.Mesh(
  new THREE.BoxGeometry(0.3, 0.8, 0.3),
  new THREE.MeshStandardMaterial(),
)
handle.name = 'Handle'
handle.position.set(1.4, 0.5, 0)
source.add(handle)

source.updateMatrixWorld(true)

const godotScene = buildEngineImportScene(source, 'godot', 'Portal Device')
assert.deepEqual(godotScene.collisionNames, [
  'Body_Shell-convcolonly',
  'Handle-convcolonly',
])
assert.equal(
  godotScene.scene.children.length,
  3,
  'visual clone + two collision proxies',
)

const unrealScene = buildEngineImportScene(source, 'unreal', 'Portal Device')
assert.deepEqual(unrealScene.collisionNames, [
  'UBX_Body_Shell_00',
  'UBX_Handle_00',
])

const dummyImport = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])
const dummyLod0 = new Uint8Array([1, 2, 3, 4, 5])
const dummyLod1 = new Uint8Array([6, 7, 8])

const input = {
  engine: 'godot' as const,
  createdAt: '2026-10-06T00:00:00.000Z',
  sourceArtifactId: 'artifact-engine-contract',
  sourceNodeId: 'node-engine-contract',
  productionProfileId: 'godot-game' as const,
  collisionNodeNames: [...godotScene.collisionNames],
  importScenePath: 'import/asset-godot.glb',
  files: [
    {
      path: 'models/lod1.glb',
      role: 'lod' as const,
      bytes: dummyLod1,
    },
    {
      path: 'IMPORT.md',
      role: 'instructions' as const,
      bytes: new TextEncoder().encode(engineImportInstructions('godot')),
    },
    {
      path: 'import/asset-godot.glb',
      role: 'import-scene' as const,
      bytes: dummyImport,
    },
    {
      path: 'models/lod0.glb',
      role: 'lod' as const,
      bytes: dummyLod0,
    },
  ],
  lods: [
    {
      lod: 0,
      path: 'models/lod0.glb',
      ratio: 1,
      triangles: 1200,
    },
    {
      lod: 1,
      path: 'models/lod1.glb',
      ratio: 0.5,
      triangles: 600,
    },
  ],
  notes: ['contract fixture'],
}

const first = await buildEnginePack(input)
const second = await buildEnginePack(input)

assert.deepEqual(
  first.zipBytes,
  second.zipBytes,
  'fixed metadata + sorted paths should make ZIP bytes deterministic',
)

assert.deepEqual(inspectEngineZip(first.zipBytes), [
  'IMPORT.md',
  'import/asset-godot.glb',
  'models/lod0.glb',
  'models/lod1.glb',
  'phiform-engine-manifest.json',
])

assert.equal(first.manifest.schema, 'phiform.engine-pack.v1')
assert.equal(first.manifest.engine, 'godot')
assert.equal(first.manifest.coordinates.linearUnit, 'meter')
assert.equal(first.manifest.coordinates.upAxis, '+Y')
assert.equal(first.manifest.coordinates.forwardAxis, '+Z')
assert.deepEqual(
  first.manifest.collision.nodeNames,
  godotScene.collisionNames,
)
assert.equal(first.manifest.lods[0]?.triangles, 1200)
assert.equal(first.manifest.lods[1]?.ratio, 0.5)
assert.match(first.manifest.lods[0]?.sha256 ?? '', /^[a-f0-9]{64}$/)

const unpacked = unzipSync(first.zipBytes)
const embeddedManifest = JSON.parse(
  strFromU8(unpacked['phiform-engine-manifest.json']),
)
assert.equal(embeddedManifest.sourceArtifactId, 'artifact-engine-contract')
assert.equal(embeddedManifest.importScenePath, 'import/asset-godot.glb')

const zipHash = await sha256Bytes(first.zipBytes)
assert.match(zipHash, /^[a-f0-9]{64}$/)

assert.match(engineImportInstructions('godot'), /-convcolonly/)
assert.match(engineImportInstructions('unreal'), /UBX_/)
assert.match(
  engineImportInstructions('unreal'),
  /not claim to generate native \.uasset/i,
)

disposeEngineScene(godotScene.scene)
disposeEngineScene(unrealScene.scene)
body.geometry.dispose()
body.material.dispose()
handle.geometry.dispose()
handle.material.dispose()

process.stdout.write(
  [
    'PASS engine naming conventions',
    'PASS per-mesh box collision proxies',
    'PASS deterministic ZIP bytes',
    'PASS engine manifest coordinates and LOD hashes',
    'PASS embedded manifest',
    'PASS Godot/Unreal import notes',
    'PASS package SHA-256: ' + zipHash.slice(0, 16) + '…',
  ].join('\n') + '\n',
)
