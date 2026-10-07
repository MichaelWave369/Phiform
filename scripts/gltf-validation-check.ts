import assert from 'node:assert/strict'
import {
  compactBasisuGlb,
  makeTextureMarker,
  rewriteGlbWithBasisu,
} from '../src/gltf/basisuGlb'
import {
  buildGltfValidationReceipt,
  validateBasisuSemantics,
} from '../src/gltf/validation'
import type {
  GltfValidationIssue,
  ModelArtifact,
} from '../src/core/types'
import type { GltfValidatorResponse } from '../src/gltf/validatorClient'

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, true)
  return bytes
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function pad4(bytes: Uint8Array, fill: number): Uint8Array {
  const length = (bytes.length + 3) & ~3
  const output = new Uint8Array(length)
  output.set(bytes)
  output.fill(fill, bytes.length)
  return output
}

function sourceGlb(): Uint8Array {
  const json = {
    asset: { version: '2.0', generator: 'PhiForm validation fixture' },
    buffers: [{ byteLength: 8 }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
    ],
    images: [
      { bufferView: 0, mimeType: 'image/png', name: 'Fallback' },
    ],
    textures: [
      {
        source: 0,
        name: makeTextureMarker('texture-a', 'Base Color'),
      },
    ],
  }

  const jsonBytes = pad4(
    new TextEncoder().encode(JSON.stringify(json)),
    0x20,
  )
  const bin = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length

  return concat([
    u32(GLB_MAGIC),
    u32(2),
    u32(total),
    u32(jsonBytes.length),
    u32(JSON_CHUNK),
    jsonBytes,
    u32(bin.length),
    u32(BIN_CHUNK),
    bin,
  ])
}

const ktx = new Uint8Array([
  0xab, 0x4b, 0x54, 0x58,
  0x20, 0x32, 0x30, 0xbb,
  0x0d, 0x0a, 0x1a, 0x0a,
  9, 8, 7, 6,
])

const fallback = rewriteGlbWithBasisu(sourceGlb(), [
  {
    textureId: 'texture-a',
    textureName: 'Base Color',
    sha256: 'a'.repeat(64),
    bytes: ktx,
  },
])
const compact = compactBasisuGlb(fallback.bytes)

const fallbackChecks = validateBasisuSemantics(
  fallback.bytes,
  'basisu-fallback',
)
assert.equal(fallbackChecks.status, 'pass')
assert.ok(
  fallbackChecks.checks.every((entry) => entry.status === 'pass'),
)

const compactChecks = validateBasisuSemantics(
  compact.bytes,
  'basisu-compact',
)
assert.equal(compactChecks.status, 'pass')
assert.ok(
  compactChecks.checks.every((entry) => entry.status === 'pass'),
)

const invalidCompactChecks = validateBasisuSemantics(
  fallback.bytes,
  'basisu-compact',
)
assert.equal(invalidCompactChecks.status, 'fail')
assert.ok(
  invalidCompactChecks.checks.some(
    (entry) =>
      entry.code === 'BASISU_EXTENSION_REQUIRED' &&
      entry.status === 'fail',
  ),
)

const artifact: ModelArtifact = {
  kind: 'primitive',
  id: 'validation-artifact',
  label: 'Validation Fixture',
  primitive: 'cube',
  seed: 369,
  scale: [1, 1, 1],
  material: { metalness: 0.2, roughness: 0.5 },
  createdAt: '2026-10-06T00:00:00.000Z',
}

function response(
  errors: number,
  warnings: number,
  infos = 0,
  messages: GltfValidationIssue[] = [],
): GltfValidatorResponse {
  return {
    schema: 'phiform.gltf-validation-response.v1',
    sha256: 'f'.repeat(64),
    byteLength: fallback.bytes.byteLength,
    report: {
      schema: 'phiform.gltf-validator-report.v1',
      validator: {
        name: 'Khronos glTF-Validator',
        version: '2.0.0-dev.3.10',
      },
      mimeType: 'model/gltf-binary',
      issues: {
        numErrors: errors,
        numWarnings: warnings,
        numInfos: infos,
        numHints: 0,
        truncated: false,
        messages,
      },
      info: {
        version: '2.0',
        generator: 'PhiForm validation fixture',
        extensionsUsed: ['KHR_texture_basisu'],
        extensionsRequired: [],
      },
    },
  }
}

const passReceipt = buildGltfValidationReceipt(
  artifact,
  'node-a',
  'basisu-fallback',
  'basisu-receipt-a',
  'fallback.glb',
  response(0, 0, 1, [
    {
      code: 'UNSUPPORTED_EXTENSION',
      severity: 2,
      message: 'informational extension coverage notice',
      pointer: '/extensionsUsed/0',
    },
  ]),
  fallbackChecks,
  '2026-10-06T00:01:00.000Z',
)
assert.equal(passReceipt.qualification, 'pass')
assert.equal(passReceipt.official.numInfos, 1)

const warningReceipt = buildGltfValidationReceipt(
  artifact,
  'node-a',
  'basisu-fallback',
  'basisu-receipt-a',
  'fallback.glb',
  response(0, 1),
  fallbackChecks,
)
assert.equal(warningReceipt.qualification, 'warning')

const officialFail = buildGltfValidationReceipt(
  artifact,
  'node-a',
  'basisu-fallback',
  'basisu-receipt-a',
  'fallback.glb',
  response(1, 0),
  fallbackChecks,
)
assert.equal(officialFail.qualification, 'fail')

const phiformFail = buildGltfValidationReceipt(
  artifact,
  'node-a',
  'basisu-compact',
  'compact-receipt-a',
  'compact.glb',
  response(0, 0),
  invalidCompactChecks,
)
assert.equal(phiformFail.qualification, 'fail')

process.stdout.write(
  [
    'PASS fallback BasisU semantic checks',
    'PASS compact BasisU semantic checks',
    'PASS compact/fallback mismatch detected',
    'PASS info-only Khronos report remains PASS',
    'PASS Khronos warning maps to WARNING',
    'PASS Khronos error maps to FAIL',
    'PASS PhiForm BasisU failure maps to FAIL',
  ].join('\n') + '\n',
)
