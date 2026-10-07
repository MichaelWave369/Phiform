import assert from 'node:assert/strict'
import type {
  BasisuCompactReceipt,
  GltfValidationReceipt,
} from '../src/core/types'
import {
  buildReleaseCandidate,
  inspectReleaseZip,
  releasePolicyAllows,
  sha256Bytes,
} from '../src/release/pack'

const assetBytes = new Uint8Array([
  0x67, 0x6c, 0x54, 0x46,
  2, 0, 0, 0,
  12, 0, 0, 0,
])
const assetSha256 = await sha256Bytes(assetBytes)

const compactReceipt: BasisuCompactReceipt = {
  schema: 'phiform.basisu-compact-receipt.v1',
  id: 'compact-receipt-a',
  createdAt: '2026-10-06T00:00:00.000Z',
  sourceArtifactId: 'artifact-a',
  sourceNodeId: 'node-a',
  sourceBasisuDerivedReceiptId: 'basisu-derived-a',
  sourceFilename: 'asset-basisu-fallback.glb',
  outputFilename: 'asset-basisu-compact.glb',
  sourceGlbSha256: 'a'.repeat(64),
  sourceGlbByteLength: 120,
  outputGlbSha256: assetSha256,
  outputGlbByteLength: assetBytes.byteLength,
  extensionUsed: 'KHR_texture_basisu',
  extensionRequired: true,
  textureCount: 1,
  removedFallbackImageCount: 1,
  removedBufferViewCount: 1,
  removedBinaryBytes: 64,
  byteSavings: 64,
  byteSavingsRatio: 64 / 120,
  notes: [],
}

function validation(
  qualification: 'pass' | 'warning' | 'fail',
  {
    targetReceiptId = compactReceipt.id,
    artifactId = 'artifact-a',
    nodeId = 'node-a',
    errors = qualification === 'fail' ? 1 : 0,
    basisu = qualification === 'fail' ? 'fail' : 'pass',
  }: {
    targetReceiptId?: string
    artifactId?: string
    nodeId?: string
    errors?: number
    basisu?: 'pass' | 'fail'
  } = {},
): GltfValidationReceipt {
  return {
    schema: 'phiform.gltf-validation-receipt.v1',
    id: `validation-${qualification}-${targetReceiptId}`,
    createdAt: '2026-10-06T00:01:00.000Z',
    sourceArtifactId: artifactId,
    sourceNodeId: nodeId,
    target: 'basisu-compact',
    targetReceiptId,
    filename: compactReceipt.outputFilename,
    glbSha256: assetSha256,
    glbByteLength: assetBytes.byteLength,
    qualification,
    official: {
      validatorName: 'Khronos glTF-Validator',
      validatorVersion: '2.0.0-dev.3.10',
      mimeType: 'model/gltf-binary',
      numErrors: errors,
      numWarnings: qualification === 'warning' ? 1 : 0,
      numInfos: 0,
      numHints: 0,
      truncated: false,
      messages: [],
      extensionsUsed: ['KHR_texture_basisu'],
      extensionsRequired: ['KHR_texture_basisu'],
    },
    phiformBasisu: {
      status: basisu,
      checks: [],
    },
    notes: [],
  }
}

const baseInput = {
  createdAt: '2026-10-06T00:02:00.000Z',
  releaseId: 'release-a',
  sourceArtifactId: 'artifact-a',
  sourceNodeId: 'node-a',
  target: 'basisu-compact' as const,
  assetFilename: compactReceipt.outputFilename,
  assetBytes,
  targetReceipt: compactReceipt,
}

assert.equal(releasePolicyAllows('strict-pass', 'pass'), true)
assert.equal(releasePolicyAllows('strict-pass', 'warning'), false)
assert.equal(releasePolicyAllows('allow-warning', 'warning'), true)
assert.equal(releasePolicyAllows('allow-warning', 'fail'), false)

const strict = await buildReleaseCandidate({
  ...baseInput,
  policyId: 'strict-pass',
  validationReceipt: validation('pass'),
})
assert.equal(strict.receipt.decision, 'released')
assert.equal(strict.receipt.policyId, 'strict-pass')
assert.equal(strict.manifest.validation.qualification, 'pass')
assert.equal(strict.manifest.asset.sha256, assetSha256)
assert.equal(strict.receipt.packageSha256, await sha256Bytes(strict.zipBytes))
assert.deepEqual(inspectReleaseZip(strict.zipBytes), [
  'RELEASE.md',
  'asset/asset-basisu-compact.glb',
  'phiform-release-manifest.json',
  'receipts/gltf-validation-receipt.json',
  'receipts/target-derived-receipt.json',
])

const strictRepeat = await buildReleaseCandidate({
  ...baseInput,
  policyId: 'strict-pass',
  validationReceipt: validation('pass'),
})
assert.equal(
  await sha256Bytes(strictRepeat.zipBytes),
  strict.receipt.packageSha256,
)

await assert.rejects(
  buildReleaseCandidate({
    ...baseInput,
    policyId: 'strict-pass',
    validationReceipt: validation('warning'),
  }),
  /does not accept validation qualification warning/,
)

const warningRelease = await buildReleaseCandidate({
  ...baseInput,
  releaseId: 'release-warning',
  policyId: 'allow-warning',
  validationReceipt: validation('warning'),
})
assert.equal(
  warningRelease.manifest.validation.qualification,
  'warning',
)

await assert.rejects(
  buildReleaseCandidate({
    ...baseInput,
    policyId: 'allow-warning',
    validationReceipt: validation('fail'),
  }),
  /validation contains an error or PhiForm BasisU failure/,
)

await assert.rejects(
  buildReleaseCandidate({
    ...baseInput,
    assetBytes: new Uint8Array([...assetBytes, 99]),
    policyId: 'strict-pass',
    validationReceipt: validation('pass'),
  }),
  /Release asset bytes do not match/,
)

await assert.rejects(
  buildReleaseCandidate({
    ...baseInput,
    policyId: 'strict-pass',
    validationReceipt: validation('pass', {
      targetReceiptId: 'other-receipt',
    }),
  }),
  /does not bind the selected derived-artifact receipt/,
)

await assert.rejects(
  buildReleaseCandidate({
    ...baseInput,
    policyId: 'strict-pass',
    validationReceipt: validation('pass', {
      nodeId: 'stale-node',
    }),
  }),
  /Validation receipt does not belong to the current artifact and graph node/,
)

process.stdout.write(
  [
    'PASS strict policy accepts PASS',
    'PASS strict policy rejects WARNING',
    'PASS allow-warning policy accepts WARNING',
    'PASS FAIL is never releasable',
    'PASS exact GLB bytes match derived + validation receipts',
    'PASS forged release bytes rejected',
    'PASS stale validation receipt rejected',
    'PASS mismatched target receipt rejected',
    'PASS deterministic release ZIP hash',
    'PASS release package contains asset + evidence + manifest',
  ].join('\n') + '\n',
)
