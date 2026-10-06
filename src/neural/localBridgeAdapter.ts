import type {
  GenerationRequest,
  GenerationResult,
  GenerationRuntimeInputs,
} from '../core/types'
import type { Neural3DAdapter } from './adapter'
import type { BridgeBackend } from './bridgeTypes'
import { LocalBridgeClient } from './localBridgeClient'

function id(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  return randomId ? `${prefix}-${randomId}` : `${prefix}-${Date.now().toString(36)}`
}

export class LocalBridgeAdapter implements Neural3DAdapter {
  readonly id: string
  readonly label: string
  readonly capabilities
  private readonly client: LocalBridgeClient

  constructor(endpoint: string, readonly backend: BridgeBackend) {
    this.id = `bridge.${backend.id}`
    this.label = backend.label
    this.client = new LocalBridgeClient(endpoint)
    this.capabilities = {
      textTo3D: backend.capabilities.textTo3D,
      imageTo3D: backend.capabilities.imageTo3D,
      multiView: backend.capabilities.multiView,
      localInference: true,
      editableMeshOutput: false,
    }
  }

  async generate(
    request: GenerationRequest,
    runtime?: GenerationRuntimeInputs,
  ): Promise<GenerationResult> {
    if (request.image && !runtime?.imageFile) {
      throw new Error('Image metadata is present but no image bytes were supplied.')
    }

    if (request.image && !this.capabilities.imageTo3D) {
      throw new Error(`${this.label} does not declare image-to-3D capability.`)
    }

    if (!request.image && !this.capabilities.textTo3D) {
      throw new Error(`${this.label} does not declare text-to-3D capability.`)
    }

    const accepted = await this.client.submit(
      this.backend.id,
      request,
      runtime?.imageFile,
    )
    const job = await this.client.waitForJob(accepted.id)

    if (!job.artifact || job.artifact.format !== 'glb') {
      throw new Error('Bridge completed without a GLB artifact.')
    }

    const createdAt = new Date().toISOString()
    const artifactId = id('artifact')

    return {
      artifact: {
        kind: 'glb',
        id: artifactId,
        label: request.prompt.trim() || request.image?.name || 'Bridge model',
        seed: job.seed,
        createdAt,
        format: 'glb',
        url: this.client.artifactUrl(job.artifact.url),
        backendId: job.backendId,
        sha256: job.artifact.sha256,
        byteLength: job.artifact.byteLength,
      },
      receipt: {
        schema: 'phiform.receipt.v1',
        id: id('receipt'),
        adapterId: this.id,
        adapterLabel: this.label,
        backendId: job.backendId,
        jobId: job.id,
        createdAt,
        request,
        outputArtifactId: artifactId,
        seed: job.seed,
        status: 'success',
        output: {
          format: 'glb',
          sha256: job.artifact.sha256,
          byteLength: job.artifact.byteLength,
        },
        notes: [
          ...(job.notes ?? []),
          this.backend.license
            ? `Backend license: ${this.backend.license}`
            : 'Backend license was not reported by the bridge.',
        ],
      },
    }
  }
}
