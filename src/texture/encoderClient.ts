import type {
  TextureEncoderCodec,
  TextureEncoderDescriptor,
} from '../core/types'

export interface TextureEncodeJob {
  schema: 'phiform.texture-encode-job.v1'
  id: string
  textureId: string
  codec: TextureEncoderCodec
  colorSpace: 'srgb' | 'linear'
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  createdAt: string
  sourceSha256: string
  sourceByteLength: number
  artifact?: {
    url: string
    format: 'ktx2'
    mimeType: 'image/ktx2'
    sha256: string
    byteLength: number
  }
  encoder?: {
    id: 'khronos.ktx.v1'
    version: string
  }
  notes?: string[]
  error?: string
}

function normalizeEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export class TextureEncoderClient {
  readonly endpoint: string

  constructor(endpoint: string) {
    this.endpoint = normalizeEndpoint(endpoint)
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.endpoint}${path}`, init)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `Texture encoder ${response.status}: ${text || response.statusText}`,
      )
    }
    return response.json() as Promise<T>
  }

  descriptor(): Promise<TextureEncoderDescriptor> {
    return this.json<TextureEncoderDescriptor>('/v1/texture-encoder')
  }

  async submit(
    textureId: string,
    sourcePng: Blob,
    sourceSha256: string,
    codec: TextureEncoderCodec,
    colorSpace: 'srgb' | 'linear',
  ): Promise<TextureEncodeJob> {
    const bytes = new Uint8Array(await sourcePng.arrayBuffer())
    return this.json<TextureEncodeJob>('/v1/texture-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        textureId,
        codec,
        colorSpace,
        sourceSha256,
        sourcePngBase64: bytesToBase64(bytes),
      }),
    })
  }

  job(id: string): Promise<TextureEncodeJob> {
    return this.json<TextureEncodeJob>(
      `/v1/texture-jobs/${encodeURIComponent(id)}`,
    )
  }

  async waitForJob(
    id: string,
    timeoutMs = 300_000,
    pollMs = 500,
  ): Promise<TextureEncodeJob> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const job = await this.job(id)
      if (job.status === 'succeeded') return job
      if (job.status === 'failed') {
        throw new Error(job.error || `Texture job ${id} failed.`)
      }
      await new Promise((resolve) => window.setTimeout(resolve, pollMs))
    }

    throw new Error(`Texture job ${id} timed out after ${timeoutMs} ms.`)
  }

  async artifact(job: TextureEncodeJob): Promise<Blob> {
    if (job.status !== 'succeeded' || !job.artifact) {
      throw new Error('Texture job has no completed KTX2 artifact.')
    }

    const response = await fetch(
      new URL(job.artifact.url, `${this.endpoint}/`).toString(),
    )
    if (!response.ok) {
      throw new Error(
        `KTX2 artifact fetch failed: ${response.status} ${response.statusText}`,
      )
    }
    return response.blob()
  }
}
