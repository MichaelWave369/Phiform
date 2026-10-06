import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { proofBackend } from '../../bridge/backends/proof.mjs'

const args = process.argv.slice(2)
const imagePath = args[0]
const outputIndex = args.indexOf('--output-dir')
const outputDir = outputIndex >= 0 ? args[outputIndex + 1] : ''

if (!imagePath || !outputDir) {
  process.stderr.write('fixture expects: run.mjs <image> --output-dir <dir>\n')
  process.exit(2)
}

const result = await proofBackend.run({ prompt: 'sf3d-cli-fixture' })
const targetDir = resolve(outputDir, '0')
await mkdir(targetDir, { recursive: true })
await writeFile(join(targetDir, 'mesh.glb'), result.buffer)
process.stdout.write('SF3D CLI fixture wrote output/0/mesh.glb\n')
