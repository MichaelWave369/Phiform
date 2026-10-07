import { strToU8, unzipSync, zipSync } from 'fflate'
import type {
  BasisuCompactReceipt,
  BasisuDerivedReceipt,
  GltfValidationReceipt,
  ReleaseCandidateManifest,
  ReleaseCandidateReceipt,
  ReleaseFileRecord,
  ReleasePolicyId,
  ReleaseTarget,
} from '../core/types'

const FIXED_ZIP_TIME = new Date(2000, 0, 1, 0, 0, 0)

export interface ReleaseBuildInput {
  createdAt: string
  releaseId: string
  sourceArtifactId: string
  sourceNodeId: string
  target: ReleaseTarget
  policyId: ReleasePolicyId
  assetFilename: string
  assetBytes: Uint8Array
  targetReceipt: BasisuDerivedReceipt | BasisuCompactReceipt
  validationReceipt: GltfValidationReceipt
}

export interface BuiltReleaseCandidate {
  manifest: ReleaseCandidateManifest
  receipt: ReleaseCandidateReceipt
  zipBytes: Uint8Array
}

function safeName(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'phiform-asset.glb'
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const owned = Uint8Array.from(bytes)
  const digest = await crypto.subtle.digest('SHA-256', owned.buffer)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export function releaseAcceptedQualifications(
  policyId: ReleasePolicyId,
): Array<'pass' | 'warning'> {
  return policyId === 'strict-pass'
    ? ['pass']
    : ['pass', 'warning']
}

export function releasePolicyAllows(
  policyId: ReleasePolicyId,
  qualification: GltfValidationReceipt['qualification'],
): boolean {
  return releaseAcceptedQualifications(policyId).includes(
    qualification as 'pass' | 'warning',
  )
}

function targetOutput(
  receipt: BasisuDerivedReceipt | BasisuCompactReceipt,
): {
  receiptId: string
  sourceArtifactId: string
  sourceNodeId: string
  filename: string
  sha256: string
  byteLength: number
} {
  return {
    receiptId: receipt.id,
    sourceArtifactId: receipt.sourceArtifactId,
    sourceNodeId: receipt.sourceNodeId,
    filename: receipt.outputFilename,
    sha256: receipt.outputGlbSha256,
    byteLength: receipt.outputGlbByteLength,
  }
}

function validationNotes(
  target: ReleaseTarget,
  policyId: ReleasePolicyId,
): string[] {
  return [
    'Release candidate creation is a derived packaging step; it does not mutate the editable PhiForm source.',
    `Release target: ${target}.`,
    `Release policy: ${policyId}.`,
    'The GLB bytes are re-hashed during release packaging and must match both the target receipt and validation receipt.',
    'A release candidate is blocked when Khronos validation reports errors or PhiForm BasisU checks fail.',
    'The external release receipt binds the deterministic ZIP hash; it is not embedded inside the ZIP to avoid recursive self-hashing.',
  ]
}

function releaseInstructions(
  manifest: ReleaseCandidateManifest,
): string {
  return [
    '# PhiForm Release Candidate',
    '',
    `Release ID: ${manifest.releaseId}`,
    `Target: ${manifest.target}`,
    `Policy: ${manifest.policyId}`,
    `Validation: ${manifest.validation.qualification.toUpperCase()}`,
    `Validator: ${manifest.validation.validatorName} ${manifest.validation.validatorVersion}`,
    '',
    '## Asset',
    '',
    `Path: ${manifest.asset.path}`,
    `SHA-256: ${manifest.asset.sha256}`,
    `Bytes: ${manifest.asset.byteLength}`,
    '',
    '## Authority',
    '',
    'This package was emitted only after PhiForm matched the exact GLB bytes',
    'to both their derived-artifact receipt and glTF validation receipt.',
    '',
    'The external phiform.release-receipt.v1 binds the final ZIP bytes.',
  ].join('\n')
}

export async function buildReleaseCandidate(
  input: ReleaseBuildInput,
): Promise<BuiltReleaseCandidate> {
  const target = targetOutput(input.targetReceipt)

  if (
    target.sourceArtifactId !== input.sourceArtifactId ||
    target.sourceNodeId !== input.sourceNodeId
  ) {
    throw new Error(
      'Release target receipt does not belong to the current artifact and graph node.',
    )
  }

  if (
    input.validationReceipt.sourceArtifactId !== input.sourceArtifactId ||
    input.validationReceipt.sourceNodeId !== input.sourceNodeId
  ) {
    throw new Error(
      'Validation receipt does not belong to the current artifact and graph node.',
    )
  }

  if (input.validationReceipt.target !== input.target) {
    throw new Error(
      'Validation receipt target type does not match the requested release target.',
    )
  }

  if (input.validationReceipt.targetReceiptId !== target.receiptId) {
    throw new Error(
      'Validation receipt does not bind the selected derived-artifact receipt.',
    )
  }

  if (
    input.validationReceipt.phiformBasisu.status !== 'pass' ||
    input.validationReceipt.official.numErrors > 0 ||
    input.validationReceipt.qualification === 'fail'
  ) {
    throw new Error(
      'Release gate blocked: validation contains an error or PhiForm BasisU failure.',
    )
  }

  if (
    !releasePolicyAllows(
      input.policyId,
      input.validationReceipt.qualification,
    )
  ) {
    throw new Error(
      `Release policy ${input.policyId} does not accept validation qualification ${input.validationReceipt.qualification}.`,
    )
  }

  const assetSha256 = await sha256Bytes(input.assetBytes)
  if (
    assetSha256 !== target.sha256 ||
    input.assetBytes.byteLength !== target.byteLength
  ) {
    throw new Error(
      'Release asset bytes do not match the selected derived-artifact receipt.',
    )
  }

  if (
    assetSha256 !== input.validationReceipt.glbSha256 ||
    input.assetBytes.byteLength !== input.validationReceipt.glbByteLength
  ) {
    throw new Error(
      'Release asset bytes do not match the glTF validation receipt.',
    )
  }

  const assetFilename = safeName(input.assetFilename)
  const assetPath = `asset/${assetFilename}`
  const targetReceiptPath = 'receipts/target-derived-receipt.json'
  const validationReceiptPath = 'receipts/gltf-validation-receipt.json'
  const instructionsPath = 'RELEASE.md'
  const manifestPath = 'phiform-release-manifest.json'

  const targetReceiptBytes = strToU8(
    JSON.stringify(input.targetReceipt, null, 2),
  )
  const validationReceiptBytes = strToU8(
    JSON.stringify(input.validationReceipt, null, 2),
  )

  const preliminaryFiles: Array<{
    path: string
    role: ReleaseFileRecord['role']
    bytes: Uint8Array
  }> = [
    {
      path: assetPath,
      role: 'asset',
      bytes: Uint8Array.from(input.assetBytes),
    },
    {
      path: targetReceiptPath,
      role: 'target-receipt',
      bytes: targetReceiptBytes,
    },
    {
      path: validationReceiptPath,
      role: 'validation-receipt',
      bytes: validationReceiptBytes,
    },
  ]

  const fileRecords: ReleaseFileRecord[] = []
  for (const file of preliminaryFiles) {
    fileRecords.push({
      path: file.path,
      role: file.role,
      byteLength: file.bytes.byteLength,
      sha256: await sha256Bytes(file.bytes),
    })
  }

  const manifest: ReleaseCandidateManifest = {
    schema: 'phiform.release-candidate.v1',
    createdAt: input.createdAt,
    releaseId: input.releaseId,
    sourceArtifactId: input.sourceArtifactId,
    sourceNodeId: input.sourceNodeId,
    target: input.target,
    targetReceiptId: target.receiptId,
    validationReceiptId: input.validationReceipt.id,
    policyId: input.policyId,
    acceptedQualifications:
      releaseAcceptedQualifications(input.policyId),
    asset: {
      path: assetPath,
      filename: assetFilename,
      sha256: assetSha256,
      byteLength: input.assetBytes.byteLength,
    },
    validation: {
      qualification: input.validationReceipt.qualification as
        | 'pass'
        | 'warning',
      validatorName: 'Khronos glTF-Validator',
      validatorVersion:
        input.validationReceipt.official.validatorVersion,
      officialErrors:
        input.validationReceipt.official.numErrors,
      officialWarnings:
        input.validationReceipt.official.numWarnings,
      phiformBasisuStatus: 'pass',
    },
    files: [...fileRecords],
    notes: validationNotes(input.target, input.policyId),
  }

  const instructionsBytes = strToU8(
    releaseInstructions(manifest),
  )
  const instructionsRecord: ReleaseFileRecord = {
    path: instructionsPath,
    role: 'instructions',
    byteLength: instructionsBytes.byteLength,
    sha256: await sha256Bytes(instructionsBytes),
  }
  manifest.files.push(instructionsRecord)

  const manifestBytes = strToU8(JSON.stringify(manifest, null, 2))
  const manifestRecord: ReleaseFileRecord = {
    path: manifestPath,
    role: 'manifest',
    byteLength: manifestBytes.byteLength,
    sha256: await sha256Bytes(manifestBytes),
  }

  const allFiles = [
    ...preliminaryFiles,
    {
      path: instructionsPath,
      role: 'instructions' as const,
      bytes: instructionsBytes,
    },
    {
      path: manifestPath,
      role: 'manifest' as const,
      bytes: manifestBytes,
    },
  ].sort((a, b) => a.path.localeCompare(b.path))

  const zipInput: Record<
    string,
    [Uint8Array, { level: 0 | 6; mtime: Date }]
  > = {}

  for (const file of allFiles) {
    zipInput[file.path] = [
      file.bytes,
      {
        level: file.path.endsWith('.glb') ? 0 : 6,
        mtime: FIXED_ZIP_TIME,
      },
    ]
  }

  const zipBytes = zipSync(zipInput, {
    level: 6,
    mtime: FIXED_ZIP_TIME,
  })
  const packageSha256 = await sha256Bytes(zipBytes)
  const packageFilename =
    `${safeName(assetFilename.replace(/\.glb$/i, ''))}-release-` +
    `${input.policyId}.zip`

  const receipt: ReleaseCandidateReceipt = {
    schema: 'phiform.release-receipt.v1',
    id: `release-receipt-${input.releaseId}`,
    createdAt: input.createdAt,
    releaseId: input.releaseId,
    sourceArtifactId: input.sourceArtifactId,
    sourceNodeId: input.sourceNodeId,
    target: input.target,
    targetReceiptId: target.receiptId,
    validationReceiptId: input.validationReceipt.id,
    policyId: input.policyId,
    packageFilename,
    packageByteLength: zipBytes.byteLength,
    packageSha256,
    manifest,
    files: [...manifest.files, manifestRecord]
      .sort((a, b) => a.path.localeCompare(b.path)),
    decision: 'released',
  }

  return {
    manifest,
    receipt,
    zipBytes,
  }
}

export function inspectReleaseZip(bytes: Uint8Array): string[] {
  return Object.keys(unzipSync(bytes)).sort()
}
