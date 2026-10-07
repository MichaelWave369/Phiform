import {
  generateKeyPairSync,
  randomBytes,
} from 'node:crypto'
import {
  chmod,
  mkdir,
  writeFile,
} from 'node:fs/promises'
import {
  dirname,
  resolve,
} from 'node:path'

const privatePath = resolve(
  process.argv[2] || './secrets/phiform-release-ed25519.private.pem',
)
const publicPath = privatePath.replace(
  /(?:\.private)?\.pem$/i,
  '.public.pem',
)

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const privatePem = privateKey.export({
  type: 'pkcs8',
  format: 'pem',
})
const publicPem = publicKey.export({
  type: 'spki',
  format: 'pem',
})
const token = randomBytes(32).toString('base64url')

await mkdir(dirname(privatePath), { recursive: true })
await writeFile(privatePath, privatePem, { flag: 'wx' })
await writeFile(publicPath, publicPem, { flag: 'wx' })

try {
  await chmod(privatePath, 0o600)
} catch {}

process.stdout.write(
  [
    'PhiForm Ed25519 release signer initialized.',
    '',
    `Private key: ${privatePath}`,
    `Public key:  ${publicPath}`,
    '',
    'PowerShell:',
    `$env:PHIFORM_RELEASE_SIGNING_KEY = "${privatePath.replaceAll('\\', '\\\\')}"`,
    `$env:PHIFORM_RELEASE_SIGNING_TOKEN = "${token}"`,
    'npm run bridge',
    '',
    'The token is not stored by PhiForm. You may choose a new random token on every bridge start.',
    'Never commit the private key.',
  ].join('\n') + '\n',
)
