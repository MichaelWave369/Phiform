# Adapter Contract

An adapter is deliberately small.

```ts
interface Neural3DAdapter {
  readonly id: string
  readonly label: string
  readonly capabilities: AdapterCapabilities
  generate(request: GenerationRequest): Promise<GenerationResult>
}
```

## Rules

1. Capabilities must be declared before execution.
2. Unsupported capability must not be faked.
3. A successful generation returns both an artifact and a receipt.
4. Adapters do not directly mutate unrelated workspace state.
5. Backend/model identity belongs in receipts.
6. Third-party model licensing stays explicit.
7. Failure receipts will be added before production inference is enabled.

## Rung 1 proof adapter

`proof.procedural.v1` is intentionally not neural. It deterministically selects and parameterizes a Three.js primitive from the request. Its purpose is to qualify:

- request flow
- artifact replacement
- UI state
- receipt emission
- adapter swapping

A real model adapter should be able to replace it without changing those concepts.
