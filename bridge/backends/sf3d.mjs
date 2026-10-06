import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join, resolve } from 'node:path'

function hashText(value) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function safeExtension(image) {
  const fromName = extname(String(image?.name || '')).toLowerCase()
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(fromName)) return fromName
  if (image?.type === 'image/jpeg') return '.jpg'
  if (image?.type === 'image/webp') return '.webp'
  return '.png'
}

function assertGlb(buffer) {
  if (buffer.length < 12 || buffer.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error('SF3D output is not a GLB file')
  }
  if (buffer.readUInt32LE(4) !== 2) {
    throw new Error('SF3D output is not GLB version 2')
  }
  if (buffer.readUInt32LE(8) !== buffer.length) {
    throw new Error('SF3D GLB header length does not match served bytes')
  }
}

function runProcess(command, args, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      ...options,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    const append = (current, chunk) => (current + chunk.toString()).slice(-24_000)
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk) })
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk) })

    child.on('error', rejectPromise)
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr })
        return
      }
      const tail = (stderr || stdout).trim().slice(-4000)
      rejectPromise(
        new Error(
          `SF3D runner exited with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}${tail ? `: ${tail}` : ''}`,
        ),
      )
    })
  })
}

export function createSf3dBackend(env = process.env) {
  const configuredDir = String(env.PHIFORM_SF3D_DIR || '').trim()
  const sf3dDir = configuredDir ? resolve(configuredDir) : ''
  const python = String(env.PHIFORM_SF3D_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')).trim()
  const runnerScript = String(
    env.PHIFORM_SF3D_RUN_SCRIPT || (sf3dDir ? join(sf3dDir, 'run.py') : ''),
  ).trim()
  const textureResolution = Number(env.PHIFORM_SF3D_TEXTURE_RESOLUTION || 1024)
  const remesh = String(env.PHIFORM_SF3D_REMESH || 'none').trim().toLowerCase()
  const targetVertexCount = Number(env.PHIFORM_SF3D_TARGET_VERTEX_COUNT || -1)
  const device = String(env.PHIFORM_SF3D_DEVICE || '').trim()
  const pretrainedModel = String(env.PHIFORM_SF3D_PRETRAINED_MODEL || '').trim()

  const hasDirectory = Boolean(sf3dDir && existsSync(sf3dDir))
  const hasRunner = Boolean(runnerScript && existsSync(runnerScript))
  const available = hasDirectory && hasRunner
  const statusReason = available
    ? undefined
    : !configuredDir
      ? 'Set PHIFORM_SF3D_DIR to an installed stable-fast-3d checkout.'
      : !hasDirectory
        ? 'PHIFORM_SF3D_DIR does not exist.'
        : 'SF3D runner script was not found.'

  return {
    descriptor: {
      id: 'stability.sf3d.v1',
      label: 'Stable Fast 3D',
      kind: 'neural',
      available,
      statusReason,
      model: 'stabilityai/stable-fast-3d',
      sourceUrl: 'https://github.com/Stability-AI/stable-fast-3d',
      license: 'Stability AI Community License (separate upstream terms)',
      capabilities: {
        textTo3D: false,
        imageTo3D: true,
        multiView: false,
        glbOutput: true,
      },
    },

    validate(body) {
      if (!available) return statusReason || 'SF3D backend is unavailable'
      if (!body.image?.dataBase64) return 'Stable Fast 3D requires one image input'
      if (typeof body.image.dataBase64 !== 'string') return 'image data must be base64 text'
      return null
    },

    async run(body) {
      const requestSeed = hashText([
        String(body.prompt || ''),
        String(body.image?.name || ''),
        String(body.image?.size || 0),
      ].join('|') || 'phiform-sf3d')
      const decoded = Buffer.from(body.image.dataBase64, 'base64')

      if (decoded.length === 0) throw new Error('decoded image input is empty')
      if (Number.isFinite(body.image.size) && Number(body.image.size) !== decoded.length) {
        throw new Error(
          `image byte length mismatch: declared ${body.image.size}, decoded ${decoded.length}`,
        )
      }

      const workDir = await mkdtemp(join(tmpdir(), 'phiform-sf3d-'))
      const inputPath = join(workDir, `input${safeExtension(body.image)}`)
      const outputDir = join(workDir, 'output')

      try {
        await mkdir(outputDir, { recursive: true })
        await writeFile(inputPath, decoded)

        const args = [
          runnerScript,
          inputPath,
          '--output-dir',
          outputDir,
          '--texture-resolution',
          String(Number.isFinite(textureResolution) ? textureResolution : 1024),
          '--remesh_option',
          ['none', 'triangle', 'quad'].includes(remesh) ? remesh : 'none',
        ]

        if (Number.isFinite(targetVertexCount) && targetVertexCount >= -1) {
          args.push('--target_vertex_count', String(targetVertexCount))
        }
        if (device) args.push('--device', device)
        if (pretrainedModel) args.push('--pretrained-model', pretrainedModel)

        await runProcess(python, args, {
          cwd: sf3dDir,
          env: { ...env, PYTHONUTF8: env.PYTHONUTF8 || '1' },
        })

        const meshPath = join(outputDir, '0', 'mesh.glb')
        if (!existsSync(meshPath)) {
          throw new Error('SF3D completed but output/0/mesh.glb was not produced')
        }

        const buffer = await readFile(meshPath)
        assertGlb(buffer)

        return {
          buffer,
          seed: requestSeed,
          seedKind: 'request-fingerprint',
          notes: [
            'Neural inference executed through the operator-installed Stable Fast 3D run.py.',
            'Model identity: stabilityai/stable-fast-3d.',
            'Receipt seed is a deterministic request fingerprint; upstream run.py exposes no RNG seed flag.',
            body.prompt?.trim()
              ? 'Prompt was retained as PhiForm metadata but SF3D reconstructs from the image input.'
              : 'SF3D reconstructed from the image input.',
            `Texture resolution: ${Number.isFinite(textureResolution) ? textureResolution : 1024}.`,
            `Remesh option: ${['none', 'triangle', 'quad'].includes(remesh) ? remesh : 'none'}.`,
          ],
        }
      } finally {
        await rm(workDir, { recursive: true, force: true }).catch(() => {})
      }
    },
  }
}
