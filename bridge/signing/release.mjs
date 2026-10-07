import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  timingSafeEqual,
  verify,
} from 'node:crypto'
import { readFile } from 'node:fs/promises'

function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

function safeToken(value) {
  return typeof value === 'string' ? value : ''
}

function tokenMatches(expected, actual) {
  const a = Buffer.from(safeToken(expected))
  const b = Buffer.from(safeToken(actual))
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}

function publicFingerprint(publicKey) {
  const der = publicKey.export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(der).digest('hex')
}

function canonicalStatement(input) {
  return {
    schema: 'phiform.release-attestation-statement.v1',
    releaseId: input.releaseId,
    releaseReceiptId: input.releaseReceiptId,
    packageFilename: input.packageFilename,
    packageSha256: input.packageSha256,
    packageByteLength: input.packageByteLength,
    sourceArtifactId: input.sourceArtifactId,
    sourceNodeId: input.sourceNodeId,
    target: input.target,
    targetReceiptId: input.targetReceiptId,
    validationReceiptId: input.validationReceiptId,
    policyId: input.policyId,
  }
}

export function createReleaseSigner(env = process.env) {
  const keyPath = env.PHIFORM_RELEASE_SIGNING_KEY || ''
  const token = env.PHIFORM_RELEASE_SIGNING_TOKEN || ''
  let cached

  async function load() {
    if (cached) return cached
    if (!keyPath || !token) {
      throw new Error(
        'release signer requires PHIFORM_RELEASE_SIGNING_KEY and PHIFORM_RELEASE_SIGNING_TOKEN',
      )
    }

    const pem = await readFile(keyPath, 'utf8')
    const privateKey = createPrivateKey(pem)
    if (privateKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('release signing key must be Ed25519')
    }

    const publicKey = createPublicKey(privateKey)
    cached = {
      privateKey,
      publicKey,
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
      fingerprint: publicFingerprint(publicKey),
    }
    return cached
  }

  async function descriptor() {
    if (!keyPath || !token) {
      return {
        schema: 'phiform.release-signer.v1',
        id: 'operator.ed25519.v1',
        label: 'Operator Ed25519 Signer',
        available: false,
        algorithm: 'Ed25519',
        statusReason:
          'Configure PHIFORM_RELEASE_SIGNING_KEY and PHIFORM_RELEASE_SIGNING_TOKEN.',
      }
    }

    try {
      const loaded = await load()
      return {
        schema: 'phiform.release-signer.v1',
        id: 'operator.ed25519.v1',
        label: 'Operator Ed25519 Signer',
        available: true,
        algorithm: 'Ed25519',
        publicKeyFingerprintSha256: loaded.fingerprint,
      }
    } catch (error) {
      return {
        schema: 'phiform.release-signer.v1',
        id: 'operator.ed25519.v1',
        label: 'Operator Ed25519 Signer',
        available: false,
        algorithm: 'Ed25519',
        statusReason:
          error instanceof Error ? error.message : 'release signer unavailable',
      }
    }
  }

  async function attest(releaseReceipt, zipBytes, providedToken) {
    if (!tokenMatches(token, providedToken)) {
      throw new Error('release signing authorization failed')
    }

    const loaded = await load()
    const packageSha256 = createHash('sha256').update(zipBytes).digest('hex')

    if (
      releaseReceipt?.schema !== 'phiform.release-receipt.v1' ||
      releaseReceipt.packageSha256 !== packageSha256 ||
      releaseReceipt.packageByteLength !== zipBytes.length
    ) {
      throw new Error(
        'release ZIP bytes do not match the supplied release receipt',
      )
    }

    const statement = canonicalStatement({
      releaseId: releaseReceipt.releaseId,
      releaseReceiptId: releaseReceipt.id,
      packageFilename: releaseReceipt.packageFilename,
      packageSha256,
      packageByteLength: zipBytes.length,
      sourceArtifactId: releaseReceipt.sourceArtifactId,
      sourceNodeId: releaseReceipt.sourceNodeId,
      target: releaseReceipt.target,
      targetReceiptId: releaseReceipt.targetReceiptId,
      validationReceiptId: releaseReceipt.validationReceiptId,
      policyId: releaseReceipt.policyId,
    })
    const payload = Buffer.from(JSON.stringify(statement), 'utf8')
    const signature = sign(null, payload, loaded.privateKey)
    const signatureVerified = verify(
      null,
      payload,
      loaded.publicKey,
      signature,
    )

    if (!signatureVerified) {
      throw new Error('release signature failed local verification')
    }

    return {
      schema: 'phiform.release-attestation.v1',
      id: `release-attestation-${releaseReceipt.releaseId}`,
      createdAt: new Date().toISOString(),
      algorithm: 'Ed25519',
      signerId: 'operator.ed25519.v1',
      publicKeyFingerprintSha256: loaded.fingerprint,
      publicKeyPem: loaded.publicKeyPem,
      signedPayloadBase64: payload.toString('base64'),
      signedPayloadSha256: createHash('sha256').update(payload).digest('hex'),
      signatureBase64: signature.toString('base64'),
      signatureVerified: true,
      statement,
      notes: [
        'The private signing key remained on the localhost bridge and was not returned to the browser.',
        'The bridge recomputed the release ZIP SHA-256 before signing.',
        'The detached signature covers the exact canonical statement bytes carried in signedPayloadBase64.',
      ],
    }
  }

  return {
    descriptor,
    authorized(providedToken) {
      return tokenMatches(token, providedToken)
    },
    attest,
  }
}

export function verifyReleaseAttestation(attestation) {
  if (
    !attestation ||
    attestation.schema !== 'phiform.release-attestation.v1' ||
    attestation.algorithm !== 'Ed25519' ||
    typeof attestation.publicKeyPem !== 'string' ||
    typeof attestation.signedPayloadBase64 !== 'string' ||
    typeof attestation.signatureBase64 !== 'string'
  ) {
    return false
  }

  const publicKey = createPublicKey(attestation.publicKeyPem)
  if (publicKey.asymmetricKeyType !== 'ed25519') return false

  const payload = Buffer.from(attestation.signedPayloadBase64, 'base64')
  const signature = Buffer.from(attestation.signatureBase64, 'base64')
  const payloadSha256 = createHash('sha256').update(payload).digest('hex')
  if (payloadSha256 !== attestation.signedPayloadSha256) return false

  let decodedStatement
  try {
    decodedStatement = JSON.parse(payload.toString('utf8'))
  } catch {
    return false
  }
  if (
    JSON.stringify(decodedStatement) !==
    JSON.stringify(attestation.statement)
  ) {
    return false
  }

  const fingerprint = publicFingerprint(publicKey)
  if (fingerprint !== attestation.publicKeyFingerprintSha256) return false

  return verify(null, payload, publicKey, signature)
}
