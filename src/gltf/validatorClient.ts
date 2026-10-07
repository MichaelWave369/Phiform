import type { GltfValidationIssue } from '../core/types'

export interface GltfValidatorResponse {
  schema: 'phiform.gltf-validation-response.v1'
  sha256: string
  byteLength: number
  report: {
    schema: 'phiform.gltf-validator-report.v1'
    validator: {
      name: 'Khronos glTF-Validator'
      version: string
    }
    mimeType?: string
    issues: {
      numErrors: number
      numWarnings: number
      numInfos: number
      numHints: number
      truncated: boolean
      messages: GltfValidationIssue[]
    }
    info: {
      version?: string
      generator?: string
      extensionsUsed: string[]
      extensionsRequired: string[]
    }
  }
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

export class GltfValidatorClient {
  readonly endpoint: string

  constructor(endpoint: string) {
    this.endpoint = normalizeEndpoint(endpoint)
  }

  async validate(
    blob: Blob,
    filename: string,
    sha256: string,
  ): Promise<GltfValidatorResponse> {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const response = await fetch(`${this.endpoint}/v1/gltf-validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        filename,
        sha256,
        maxIssues: 250,
        glbBase64: bytesToBase64(bytes),
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `glTF validation ${response.status}: ${text || response.statusText}`,
      )
    }

    return response.json() as Promise<GltfValidatorResponse>
  }
}
