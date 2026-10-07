import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const KTX2_MAGIC = Buffer.from([
  0xab, 0x4b, 0x54, 0x58,
  0x20, 0x32, 0x30, 0xbb,
  0x0d, 0x0a, 0x1a, 0x0a,
])
const PNG_MAGIC = Buffer.from([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
])

export const KTX_ENCODER_ID = 'khronos.ktx.v1'
export const KTX_CODECS = ['basis-lz', 'uastc-ldr-4x4']

function prefixArgsFromEnv(env) {
  const raw = env.PHIFORM_KTX_PREFIX_ARGS_JSON
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? value
      : []
  } catch {
    return []
  }
}

export function isPngBuffer(value) {
  const buffer = Buffer.from(value)
  return buffer.length >= PNG_MAGIC.length &&
    buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
}

export function isKtx2Buffer(value) {
  const buffer = Buffer.from(value)
  return buffer.length >= KTX2_MAGIC.length &&
    buffer.subarray(0, KTX2_MAGIC.length).equals(KTX2_MAGIC)
}

export function codecArgs(codec) {
  if (codec === 'basis-lz') {
    return [
      '--encode', 'basis-lz',
      '--qlevel', '128',
      '--clevel', '2',
      '--threads', '1',
    ]
  }

  if (codec === 'uastc-ldr-4x4') {
    return [
      '--encode', 'uastc-ldr-4x4',
      '--uastc-quality', '2',
      '--uastc-rdo',
      '--uastc-rdo-l', '0.5',
      '--uastc-rdo-m',
      '--zstd', '18',
      '--threads', '1',
    ]
  }

  throw new Error(`unsupported KTX codec: ${codec}`)
}

function run(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdout = []
    const stderr = []

    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    child.on('error', reject)
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8')
      const err = Buffer.concat(stderr).toString('utf8')
      if (code !== 0) {
        reject(new Error(
          `KTX encoder exited with code ${code}: ${err || out || 'no diagnostic output'}`,
        ))
        return
      }
      resolve({ stdout: out, stderr: err })
    })
  })
}

export function createKtxEncoder(options = {}) {
  const env = options.env || process.env
  const executable = options.executable || env.PHIFORM_KTX_BIN || 'ktx'
  const prefixArgs = options.prefixArgs || prefixArgsFromEnv(env)

  function probe() {
    const result = spawnSync(
      executable,
      [...prefixArgs, '--version'],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
      },
    )

    const available = !result.error && result.status === 0
    const versionText = available
      ? String(result.stdout || result.stderr || '').trim().split(/\r?\n/)[0]
      : undefined

    return {
      schema: 'phiform.texture-encoder.v1',
      id: KTX_ENCODER_ID,
      label: 'Khronos KTX Software',
      available,
      executable,
      version: versionText || undefined,
      codecs: [...KTX_CODECS],
      ...(!available
        ? {
            statusReason:
              result.error?.message ||
              String(result.stderr || '').trim() ||
              'Khronos ktx executable was not found or did not start.',
          }
        : {}),
    }
  }

  async function encode(sourceBytes, codec, colorSpace = 'linear') {
    if (!KTX_CODECS.includes(codec)) {
      throw new Error(`unsupported KTX codec: ${codec}`)
    }
    if (colorSpace !== 'srgb' && colorSpace !== 'linear') {
      throw new Error('texture color space must be srgb or linear')
    }

    const source = Buffer.from(sourceBytes)
    if (!isPngBuffer(source)) {
      throw new Error('source payload is not a valid PNG signature')
    }

    const descriptor = probe()
    if (!descriptor.available) {
      throw new Error(descriptor.statusReason || 'KTX encoder unavailable')
    }

    const workDir = await mkdtemp(join(tmpdir(), 'phiform-ktx-'))
    const inputPath = join(workDir, 'source.png')
    const outputPath = join(workDir, 'encoded.ktx2')

    try {
      await writeFile(inputPath, source)

      await run(
        executable,
        [
          ...prefixArgs,
          'create',
          '--format',
          colorSpace === 'srgb'
            ? 'R8G8B8A8_SRGB'
            : 'R8G8B8A8_UNORM',
          '--assign-tf',
          colorSpace,
          '--generate-mipmap',
          '--mipmap-filter',
          'lanczos4',
          '--fail-on-origin-changes',
          ...codecArgs(codec),
          inputPath,
          outputPath,
        ],
        { cwd: workDir },
      )

      const output = await readFile(outputPath)
      if (!isKtx2Buffer(output)) {
        throw new Error('KTX encoder output failed the KTX2 signature check')
      }

      return {
        buffer: output,
        codec,
        colorSpace,
        version: descriptor.version || 'unknown',
        notes: [
          `Encoded by ${descriptor.label} using ${codec}.`,
          codec === 'basis-lz'
            ? 'ETC1S / BasisLZ encoding uses qlevel=128, clevel=2, threads=1.'
            : 'UASTC LDR 4x4 uses quality=2, RDO lambda=0.5, RDO single-threading, zstd=18, threads=1.',
          `Source PNG was assigned ${colorSpace} transfer semantics without inventing a color conversion.`,
          'A full mip pyramid was requested with the Khronos lanczos4 mipmap filter.',
          'Output was validated for the KTX2 identifier before hashing.',
        ],
      }
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  }

  return {
    id: KTX_ENCODER_ID,
    executable,
    prefixArgs,
    probe,
    encode,
  }
}
