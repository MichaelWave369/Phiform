import validatorPackage from 'gltf-validator'

const validator = validatorPackage?.default ?? validatorPackage

function issueMessage(value) {
  if (!value || typeof value !== 'object') return undefined
  if (
    typeof value.code !== 'string' ||
    typeof value.message !== 'string' ||
    !Number.isInteger(value.severity)
  ) {
    return undefined
  }

  return {
    code: value.code,
    severity: value.severity,
    message: value.message,
    ...(typeof value.pointer === 'string'
      ? { pointer: value.pointer }
      : {}),
    ...(Number.isInteger(value.offset)
      ? { offset: value.offset }
      : {}),
  }
}

export async function validateGlbBytes(
  bytes,
  {
    uri = 'asset.glb',
    maxIssues = 250,
  } = {},
) {
  const input = Uint8Array.from(bytes)
  const report = await validator.validateBytes(input, {
    uri,
    format: 'glb',
    maxIssues,
    writeTimestamp: false,
  })

  const issues = report?.issues ?? {}
  const messages = Array.isArray(issues.messages)
    ? issues.messages.map(issueMessage).filter(Boolean)
    : []

  return {
    schema: 'phiform.gltf-validator-report.v1',
    validator: {
      name: 'Khronos glTF-Validator',
      version:
        typeof report?.validatorVersion === 'string'
          ? report.validatorVersion
          : 'unknown',
    },
    mimeType:
      typeof report?.mimeType === 'string'
        ? report.mimeType
        : undefined,
    issues: {
      numErrors: Number(issues.numErrors ?? 0),
      numWarnings: Number(issues.numWarnings ?? 0),
      numInfos: Number(issues.numInfos ?? 0),
      numHints: Number(issues.numHints ?? 0),
      truncated: Boolean(issues.truncated),
      messages,
    },
    info: {
      version:
        typeof report?.info?.version === 'string'
          ? report.info.version
          : undefined,
      generator:
        typeof report?.info?.generator === 'string'
          ? report.info.generator
          : undefined,
      extensionsUsed: Array.isArray(report?.info?.extensionsUsed)
        ? [...report.info.extensionsUsed]
        : [],
      extensionsRequired: Array.isArray(report?.info?.extensionsRequired)
        ? [...report.info.extensionsRequired]
        : [],
    },
  }
}
