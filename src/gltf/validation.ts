import type {
  BasisuValidationCheck,
  GltfValidationReceipt,
  GltfValidationTarget,
  ModelArtifact,
} from '../core/types'
import { inspectBasisuGlb } from './basisuGlb'
import type { GltfValidatorResponse } from './validatorClient'

function check(
  code: string,
  condition: boolean,
  passMessage: string,
  failMessage: string,
): BasisuValidationCheck {
  return {
    code,
    status: condition ? 'pass' : 'fail',
    message: condition ? passMessage : failMessage,
  }
}

export function validateBasisuSemantics(
  bytes: Uint8Array,
  target: GltfValidationTarget,
): {
  status: 'pass' | 'fail'
  checks: BasisuValidationCheck[]
} {
  const inspected = inspectBasisuGlb(bytes)
  const checks: BasisuValidationCheck[] = []

  checks.push(
    check(
      'BASISU_EXTENSION_USED',
      inspected.extensionUsed,
      'KHR_texture_basisu is listed in extensionsUsed.',
      'KHR_texture_basisu is missing from extensionsUsed.',
    ),
  )

  if (target === 'basisu-fallback') {
    checks.push(
      check(
        'BASISU_EXTENSION_OPTIONAL',
        !inspected.extensionRequired,
        'Fallback-bearing asset does not require KHR_texture_basisu.',
        'Fallback-bearing asset incorrectly requires KHR_texture_basisu.',
      ),
    )
  } else {
    checks.push(
      check(
        'BASISU_EXTENSION_REQUIRED',
        inspected.extensionRequired,
        'Compact asset requires KHR_texture_basisu.',
        'Compact asset must list KHR_texture_basisu in extensionsRequired.',
      ),
    )
  }

  let basisuBindingCount = 0
  let invalidBasisuImages = 0
  let missingCoreFallbacks = 0
  let unexpectedCoreFallbacks = 0

  for (const texture of inspected.textures) {
    if (typeof texture.basisuSource === 'number') {
      basisuBindingCount += 1
      const image = inspected.images[texture.basisuSource]
      if (!image || image.mimeType !== 'image/ktx2') {
        invalidBasisuImages += 1
      }
    }

    if (target === 'basisu-fallback') {
      if (
        typeof texture.basisuSource === 'number' &&
        typeof texture.source !== 'number'
      ) {
        missingCoreFallbacks += 1
      }
    } else if (typeof texture.source === 'number') {
      unexpectedCoreFallbacks += 1
    }
  }

  checks.push(
    check(
      'BASISU_BINDING_PRESENT',
      basisuBindingCount > 0,
      `${basisuBindingCount} glTF texture binding(s) reference KTX2 alternatives.`,
      'No glTF texture references a KHR_texture_basisu image.',
    ),
  )
  checks.push(
    check(
      'BASISU_IMAGE_MIME',
      invalidBasisuImages === 0,
      'Every BasisU texture source points to image/ktx2.',
      `${invalidBasisuImages} BasisU binding(s) do not point to image/ktx2.`,
    ),
  )

  if (target === 'basisu-fallback') {
    checks.push(
      check(
        'BASISU_FALLBACK_SOURCE',
        missingCoreFallbacks === 0,
        'Every BasisU-bound texture retains a core fallback source.',
        `${missingCoreFallbacks} BasisU-bound texture(s) are missing core fallbacks.`,
      ),
    )
  } else {
    checks.push(
      check(
        'BASISU_CORE_SOURCE_STRIPPED',
        unexpectedCoreFallbacks === 0,
        'No compact texture retains a core fallback source.',
        `${unexpectedCoreFallbacks} compact texture(s) still retain core fallbacks.`,
      ),
    )

    const fallbackImages = inspected.images.filter(
      (image) =>
        image.mimeType === 'image/png' ||
        image.mimeType === 'image/jpeg',
    ).length

    checks.push(
      check(
        'BASISU_FALLBACK_IMAGES_STRIPPED',
        fallbackImages === 0,
        'No PNG/JPEG fallback image objects remain.',
        `${fallbackImages} PNG/JPEG fallback image object(s) remain.`,
      ),
    )
  }

  return {
    status: checks.some((entry) => entry.status === 'fail')
      ? 'fail'
      : 'pass',
    checks,
  }
}

export function buildGltfValidationReceipt(
  artifact: ModelArtifact,
  nodeId: string,
  target: GltfValidationTarget,
  targetReceiptId: string,
  filename: string,
  response: GltfValidatorResponse,
  basisu: ReturnType<typeof validateBasisuSemantics>,
  createdAt = new Date().toISOString(),
): GltfValidationReceipt {
  const official = response.report.issues
  const qualification: GltfValidationReceipt['qualification'] =
    official.numErrors > 0 || basisu.status === 'fail'
      ? 'fail'
      : official.numWarnings > 0
        ? 'warning'
        : 'pass'

  return {
    schema: 'phiform.gltf-validation-receipt.v1',
    id:
      `gltf-validation-receipt-` +
      (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)),
    createdAt,
    sourceArtifactId: artifact.id,
    sourceNodeId: nodeId,
    target,
    targetReceiptId,
    filename,
    glbSha256: response.sha256,
    glbByteLength: response.byteLength,
    qualification,
    official: {
      validatorName: 'Khronos glTF-Validator',
      validatorVersion: response.report.validator.version,
      mimeType: response.report.mimeType,
      numErrors: official.numErrors,
      numWarnings: official.numWarnings,
      numInfos: official.numInfos,
      numHints: official.numHints,
      truncated: official.truncated,
      messages: official.messages,
      extensionsUsed: response.report.info.extensionsUsed,
      extensionsRequired: response.report.info.extensionsRequired,
    },
    phiformBasisu: basisu,
    notes: [
      'Official glTF validation is performed by the Khronos glTF-Validator NPM package through the localhost bridge.',
      'PhiForm BasisU checks supplement the official report because the validator does not currently claim full KHR_texture_basisu semantic coverage.',
      'Information and hint severities are preserved but do not downgrade qualification.',
      'Warnings produce WARNING; official errors or PhiForm BasisU failures produce FAIL.',
    ],
  }
}
