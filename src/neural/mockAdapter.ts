import type { GenerationRequest, GenerationResult, PrimitiveKind } from '../core/types'
import type { Neural3DAdapter } from './adapter'

const primitives: PrimitiveKind[] = ['cube', 'sphere', 'torus', 'icosahedron', 'capsule']

function hashText(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function id(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
  return randomId ? `${prefix}-${randomId}` : `${prefix}-${Date.now().toString(36)}`
}

function choosePrimitive(prompt: string, seed: number): PrimitiveKind {
  const p = prompt.toLowerCase()
  if (p.includes('ring') || p.includes('portal') || p.includes('donut')) return 'torus'
  if (p.includes('orb') || p.includes('sphere') || p.includes('planet')) return 'sphere'
  if (p.includes('crystal') || p.includes('gem')) return 'icosahedron'
  if (p.includes('capsule') || p.includes('pod')) return 'capsule'
  if (p.includes('box') || p.includes('cube') || p.includes('machine')) return 'cube'
  return primitives[seed % primitives.length]
}

export const mockAdapter: Neural3DAdapter = {
  id: 'proof.procedural.v1',
  label: 'Procedural Proof Adapter',
  capabilities: {
    textTo3D: true,
    imageTo3D: false,
    multiView: false,
    localInference: true,
    editableMeshOutput: false,
  },

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const source = [
      request.prompt.trim(),
      request.image?.name ?? '',
      String(request.image?.size ?? 0),
    ].join('|')

    const seed = hashText(source || 'phiform')
    const primitive = choosePrimitive(request.prompt, seed)
    const now = new Date().toISOString()
    const artifactId = id('artifact')

    await new Promise((resolve) => setTimeout(resolve, 420))

    return {
      artifact: {
        id: artifactId,
        label: request.prompt.trim() || 'Untitled form',
        primitive,
        seed,
        scale: [
          0.85 + ((seed >>> 2) % 30) / 100,
          0.85 + ((seed >>> 7) % 45) / 100,
          0.85 + ((seed >>> 12) % 30) / 100,
        ],
        material: {
          metalness: ((seed >>> 5) % 70) / 100,
          roughness: 0.2 + ((seed >>> 11) % 65) / 100,
        },
        createdAt: now,
      },
      receipt: {
        schema: 'phiform.receipt.v1',
        id: id('receipt'),
        adapterId: this.id,
        adapterLabel: this.label,
        createdAt: now,
        request,
        outputArtifactId: artifactId,
        seed,
        status: 'success',
        notes: [
          'Rung 1 proof adapter: procedural geometry only.',
          'No neural inference was performed for this receipt.',
          request.image
            ? 'Image metadata was bound to the request but pixels were not interpreted.'
            : 'Text request bound to deterministic proof generation.',
        ],
      },
    }
  },
}
