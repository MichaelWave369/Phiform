import { readFile, writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)

if (args.length === 1 && args[0] === '--version') {
  process.stdout.write('ktx v5.0.0-phiform-fixture\n')
  process.exit(0)
}

if (args[0] !== 'create') {
  process.stderr.write('fixture only supports create\n')
  process.exit(1)
}

const inputPath = args.at(-2)
const outputPath = args.at(-1)
if (!inputPath || !outputPath) {
  process.stderr.write('missing input/output\n')
  process.exit(1)
}

const input = await readFile(inputPath)
const pngMagic = Buffer.from([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
])
if (!input.subarray(0, 8).equals(pngMagic)) {
  process.stderr.write('input is not png\n')
  process.exit(3)
}

const ktxMagic = Buffer.from([
  0xab, 0x4b, 0x54, 0x58,
  0x20, 0x32, 0x30, 0xbb,
  0x0d, 0x0a, 0x1a, 0x0a,
])

const evidence = Buffer.from(
  JSON.stringify({
    args: args.slice(1, -2),
    inputBytes: input.length,
  }),
  'utf8',
)

await writeFile(outputPath, Buffer.concat([ktxMagic, evidence]))
