import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { verifyReleaseAttestation } from '../bridge/signing/release.mjs'

const attestationPath = process.argv[2]
const packagePath = process.argv[3]

if (!attestationPath) {
  process.stderr.write(
    'Usage: npm run attestation:verify -- <attestation.json> [release.zip]\n',
  )
  process.exit(2)
}

const attestation = JSON.parse(
  await readFile(resolve(attestationPath), 'utf8'),
)

if (!verifyReleaseAttestation(attestation)) {
  process.stderr.write('FAIL Ed25519 attestation signature verification\n')
  process.exit(1)
}

if (packagePath) {
  const bytes = await readFile(resolve(packagePath))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (
    sha256 !== attestation.statement?.packageSha256 ||
    bytes.length !== attestation.statement?.packageByteLength
  ) {
    process.stderr.write(
      'FAIL release ZIP bytes do not match the signed statement\n',
    )
    process.exit(1)
  }
}

process.stdout.write(
  [
    'PASS Ed25519 signature',
    `PASS signer fingerprint ${attestation.publicKeyFingerprintSha256}`,
    `PASS release ${attestation.statement?.releaseId}`,
    packagePath
      ? 'PASS release ZIP hash + byte length'
      : 'NOTE release ZIP was not supplied; signature only was verified',
  ].join('\n') + '\n',
)
