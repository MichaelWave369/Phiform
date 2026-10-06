# Adapter Contract

An adapter remains deliberately small.

```ts
interface Neural3DAdapter {
  readonly id: string
  readonly label: string
  readonly capabilities: AdapterCapabilities

  generate(
    request: GenerationRequest,
    runtime?: GenerationRuntimeInputs,
  ): Promise<GenerationResult>
}
```

## Rules

1. Capabilities must be declared before execution.
2. Unsupported capability must not be faked.
3. A successful generation returns both an artifact and a receipt.
4. Adapters do not directly mutate unrelated workspace state.
5. Backend/model identity belongs in receipts.
6. Third-party model licensing stays explicit.
7. Binary runtime inputs stay separate from durable receipt metadata.
8. Bridge-backed GLB artifacts should carry a SHA-256 when the backend can provide one.

## Procedural proof adapter

`proof.procedural.v1` deterministically selects and parameterizes a Three.js primitive. It exists to qualify request, workspace, and receipt behavior.

It is explicitly not neural inference.

## Local bridge adapter

`LocalBridgeAdapter`:

1. validates the selected backend's declared capability,
2. sends a job to the configured local bridge,
3. polls the job,
4. requires a GLB result,
5. converts that result into an editor-owned `ModelArtifact`,
6. binds job/backend/hash data into the receipt.

The adapter does not contain model-specific inference code.
