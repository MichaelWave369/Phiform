import type {
  ReleaseAttestation,
  ReleaseCandidateReceipt,
  ReleaseSignerDescriptor,
} from '../core/types'

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

export class ReleaseSignerClient {
  readonly endpoint: string

  constructor(endpoint: string) {
    this.endpoint = normalizeEndpoint(endpoint)
  }

  async descriptor(): Promise<ReleaseSignerDescriptor> {
    const response = await fetch(`${this.endpoint}/v1/release-signer`)
    if (!response.ok) {
      throw new Error(
        `Release signer probe failed: ${response.status} ${response.statusText}`,
      )
    }
    return response.json() as Promise<ReleaseSignerDescriptor>
  }

  async attest(
    packageBlob: Blob,
    releaseReceipt: ReleaseCandidateReceipt,
    token: string,
  ): Promise<ReleaseAttestation> {
    if (!token.trim()) {
      throw new Error('Release signing token is required.')
    }

    const bytes = new Uint8Array(await packageBlob.arrayBuffer())
    const response = await fetch(`${this.endpoint}/v1/release-attest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        packageBase64: bytesToBase64(bytes),
        releaseReceipt,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `Release attestation ${response.status}: ${text || response.statusText}`,
      )
    }

    return response.json() as Promise<ReleaseAttestation>
  }
}
