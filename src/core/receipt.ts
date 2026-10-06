import type { GenerationReceipt } from './types'

export function receiptText(receipt: GenerationReceipt): string {
  return JSON.stringify(receipt, null, 2)
}

// Prototype integrity marker only. This is intentionally NOT presented as a
// cryptographic digest. A later rung will bind receipts to SHA-256 asset hashes.
export function receiptChecksum(receipt: GenerationReceipt): string {
  const input = receiptText(receipt)
  let hash = 0x811c9dc5

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
