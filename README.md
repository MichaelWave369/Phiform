# PhiForm

**PhiForm** is an AI-native 3D creation workbench built around one rule:

> Neural systems may propose geometry. The workspace keeps editable state, provenance, and export authority.

## Current state — v0.6 / Rung 6

PhiForm now exposes its workspace and edit graph through a deterministic, capability-scoped agent command rail.

### Rung 1 — workbench foundation ✅
React/TypeScript studio, Three.js viewport, adapter contract, proof generation, receipts.

### Rung 2 — local inference bridge ✅
Backend discovery, async jobs, GLB ingestion, SHA-256-bound artifacts.

### Rung 3 — first neural backend ✅
Optional Stable Fast 3D integration through an operator-installed upstream checkout.

### Rung 4 — editable workspace ✅
Orbit/select/transform/material editing, mesh inspection, browser persistence, portable projects, edited GLB export.

### Rung 5 — neural edit graph ✅
Branchable history, committed snapshots, mesh targeting, recorded-only neural intent, edit receipts, and SHA-256 derived-export lineage.

### Rung 6 — governed agent command API ✅
- `phiform.agent-command.v1`
- `phiform.agent-receipt.v1`
- operator-granted capability set
- default grant is read-only
- command-to-capability registry
- optimistic preconditions for artifact / graph node / workspace revision
- replay rejection by command ID
- mesh inventory discovery
- mesh target selection by stable ID
- workspace transform commands
- workspace material commands
- graph commit / branch / checkout commands
- neural intent recording
- GLB export dispatch through the normal derived-artifact path
- visible Agent Command Rail
- browser SDK at `window.PhiFormAgent`
- project format v3 persists agent audit receipts
- automatic project v1/v2 migration
- CI qualification for denied, stale, replayed, invalid-target, and valid commands

## Governing model

```text
agent proposal
     |
     v
phiform.agent-command.v1
     |
     +--> command known?
     +--> capability granted?
     +--> command id unused?
     +--> expected artifact/node/revision still current?
     |
     v
deterministic command executor
     |
     +--> workspace mutation
     +--> edit graph mutation
     +--> recorded neural intent
     +--> export effect dispatch
     |
     v
phiform.agent-receipt.v1
```

The agent API does not expose arbitrary DOM control, shell execution, or a generic "do anything" escape hatch.

## Browser agent API

The studio installs:

```js
window.PhiFormAgent.describe()
window.PhiFormAgent.submit(command)
```

`describe()` returns the command catalog, currently granted capabilities, state fingerprint, and discoverable mesh targets.

`submit()` accepts a `phiform.agent-command.v1` envelope and returns a receipt.

See [docs/AGENT_API.md](docs/AGENT_API.md).

## Run

```bash
npm install
npm run dev
```

Local inference bridge:

```bash
npm run bridge
```

Stable Fast 3D setup is documented in [docs/SF3D.md](docs/SF3D.md).

## Qualification

```bash
npm run contract
npm run graph:contract
npm run agent:contract
npm run check
npm run build
```

## Project files

New saves use:

```text
phiform.project.v3
```

Project v3 stores source state, generation provenance, the edit graph, embedded GLB bytes when needed, and the agent receipt audit trail.

Project v1 and v2 files remain importable. Migration never invents historical agent receipts that did not exist.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Adapter contract](docs/ADAPTERS.md)
- [Local bridge protocol](docs/BRIDGE.md)
- [Stable Fast 3D backend](docs/SF3D.md)
- [Editable workspace](docs/WORKSPACE.md)
- [Neural edit graph](docs/EDIT_GRAPH.md)
- [Agent command API](docs/AGENT_API.md)

## Planned rungs

1. Workbench foundation ✅
2. Local inference bridge ✅
3. First neural backend / SF3D ✅
4. Editable geometry workspace ✅
5. Neural edit graph ✅
6. Governed agent command API ✅
7. **Production path**: retopo/LOD, texture pipeline, export qualification, game-engine packages.

## License

PhiForm code is MIT licensed.

Third-party model code, weights, dependencies, model outputs, and services may be governed by separate terms. Stable Fast 3D is not relicensed by PhiForm.
