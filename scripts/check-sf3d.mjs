import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const configuredDir = String(process.env.PHIFORM_SF3D_DIR || '').trim()
const python = String(
  process.env.PHIFORM_SF3D_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
).trim()

const failures = []

if (!configuredDir) {
  failures.push('PHIFORM_SF3D_DIR is not set.')
} else {
  const dir = resolve(configuredDir)
  const runPy = join(dir, 'run.py')
  if (!existsSync(dir)) failures.push(`SF3D directory does not exist: ${dir}`)
  if (!existsSync(runPy)) failures.push(`Official runner not found: ${runPy}`)
}

const pythonCheck = spawnSync(python, ['--version'], {
  encoding: 'utf8',
  windowsHide: true,
})
if (pythonCheck.error || pythonCheck.status !== 0) {
  failures.push(`Python command is not runnable: ${python}`)
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`FAIL ${failure}\n`)
  process.exit(1)
}

process.stdout.write(`PASS SF3D checkout: ${resolve(configuredDir)}\n`)
process.stdout.write(
  `PASS Python: ${(pythonCheck.stdout || pythonCheck.stderr).trim() || python}\n`,
)
process.stdout.write(
  'NOTE This check validates the local runner path only. It does not download weights or prove Hugging Face access.\n',
)
