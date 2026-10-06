import type { GenerationRequest } from '../core/types'
import type { BridgeBackend, BridgeHealth, BridgeJob } from './bridgeTypes'

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

export class LocalBridgeClient {
  readonly endpoint: string

  constructor(endpoint: string) {
    this.endpoint = normalizeEndpoint(endpoint)
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, init)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Bridge ${response.status}: ${text || response.statusText}`)
    }
    return response.json() as Promise<T>
  }

  health(): Promise<BridgeHealth> {
    return this.json<BridgeHealth>('/v1/health')
  }

  async backends(): Promise<BridgeBackend[]> {
    const payload = await this.json<{ backends: BridgeBackend[] }>('/v1/backends')
    return payload.backends
  }

  async submit(
    backendId: string,
    request: GenerationRequest,
    imageFile?: File,
  ): Promise<BridgeJob> {
    const image = imageFile
      ? {
          name: imageFile.name,
          type: imageFile.type || 'application/octet-stream',
          size: imageFile.size,
          dataBase64: await fileToBase64(imageFile),
        }
      : undefined

    return this.json<BridgeJob>('/v1/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        backendId,
        prompt: request.prompt,
        image,
      }),
    })
  }

  job(id: string): Promise<BridgeJob> {
    return this.json<BridgeJob>(`/v1/jobs/${encodeURIComponent(id)}`)
  }

  async waitForJob(
    id: string,
    timeoutMs = 120_000,
    pollMs = 500,
  ): Promise<BridgeJob> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const job = await this.job(id)
      if (job.status === 'succeeded') return job
      if (job.status === 'failed') {
        throw new Error(job.error || `Bridge job ${id} failed`)
      }
      await new Promise((resolve) => window.setTimeout(resolve, pollMs))
    }

    throw new Error(`Bridge job ${id} timed out after ${timeoutMs} ms`)
  }

  artifactUrl(path: string): string {
    return new URL(path, `${this.endpoint}/`).toString()
  }
}
