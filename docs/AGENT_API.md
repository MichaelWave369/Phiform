# Governed Agent Command API — Rung 6

PhiForm exposes a deterministic command rail for agents without granting general UI, filesystem, process, or model authority.

## Schemas

Commands:

```text
phiform.agent-command.v1
```

Receipts:

```text
phiform.agent-receipt.v1
```

Browser descriptor:

```text
phiform.agent-descriptor.v1
```

## Browser SDK

When the studio is running:

```js
window.PhiFormAgent.describe()
window.PhiFormAgent.submit(command)
```

The visible Agent Command Rail uses the same executor.

### describe()

Returns:

- PhiForm agent API version
- command catalog
- capability required by each command
- currently granted capabilities
- current state fingerprint
- current mesh target inventory

### submit(command)

Accepts a parsed command envelope and returns one agent receipt.

The method does not bypass capability grants.

## Command envelope

```json
{
  "schema": "phiform.agent-command.v1",
  "id": "cmd-123",
  "agentId": "my-agent",
  "command": "workspace.transform.set",
  "args": {
    "position": [0.5, 0, 0]
  },
  "expected": {
    "artifactId": "artifact-...",
    "nodeId": "edit-node-...",
    "revision": 7
  }
}
```

`expected` is optional, but agents should use it for mutations.

If any supplied expected value is stale, PhiForm rejects the command.

## Capabilities

Current capabilities:

```text
workspace.read
workspace.transform
workspace.material
target.write
graph.write
neural.intent
artifact.export
```

The UI starts with only:

```text
workspace.read
```

granted.

Capability changes require an operator action in the Agent Command Rail.

## Commands

### workspace.read

Capability:

```text
workspace.read
```

Returns current artifact ID/type, graph node, branch, revision, target, edit state, and mesh inventory.

### workspace.transform.set

Capability:

```text
workspace.transform
```

Accepted arguments:

```json
{
  "position": [1, 0, 0],
  "rotationDegrees": [0, 45, 0],
  "scale": [1.1, 1.1, 1.1]
}
```

All fields are optional. Scale values must be finite and greater than zero.

A successful transform increments workspace revision.

### workspace.material.set

Capability:

```text
workspace.material
```

Accepted arguments may include:

```json
{
  "enabled": true,
  "color": "#b77cff",
  "metalness": 0.55,
  "roughness": 0.28
}
```

Metalness and roughness must be within 0..1.

### target.artifact

Capability:

```text
target.write
```

Selects whole-artifact scope.

### target.mesh

Capability:

```text
target.write
```

Example:

```json
{
  "id": "mesh-003"
}
```

The ID must exist in the current mesh inventory returned by `describe()` or `workspace.read`.

Agents cannot manufacture a mesh target by supplying their own name/count metadata.

### graph.commit

Capability:

```text
graph.write
```

Creates a workspace snapshot from current edits and target.

### graph.branch

Capability:

```text
graph.write
```

Creates and activates a branch from the current graph node.

### graph.checkout

Capability:

```text
graph.write
```

Checks out an existing graph node and restores that node's committed workspace state and target.

### neural.intent.record

Capability:

```text
neural.intent
```

Records a neural edit request against either the current target or whole artifact.

The resulting edit-graph node remains:

```text
execution: recorded-only
```

No localized neural backend is implied.

### artifact.export.glb

Capability:

```text
artifact.export
```

Dispatches the normal edited-GLB export path.

The agent receipt status is:

```text
dispatched
```

not `executed`, because the command receipt proves dispatch only.

Successful GLB materialization is proven later by the normal `derived-export` graph node containing SHA-256 and byte length.

## Receipt statuses

### executed

The synchronous command mutation/read completed.

### dispatched

A governed asynchronous/effectful operation was accepted and handed to the existing workspace path.

### rejected

No command mutation/effect was authorized.

A rejection receipt includes a reason.

## Replay protection

PhiForm keeps recent agent receipts.

If a command ID already has a receipt, submitting that ID again returns a rejection.

This applies even if the first command was rejected. An agent must issue a new command ID for a new attempt.

## Stale-state protection

Mutating agents should bind commands to the state they inspected.

Example:

```json
{
  "expected": {
    "artifactId": "artifact-a",
    "nodeId": "edit-node-b",
    "revision": 12
  }
}
```

If a human or another agent has moved the workspace to revision 13, the old command is rejected rather than applied over newer work.

## Audit persistence

Rung 6 projects use:

```text
phiform.project.v3
```

The project stores agent receipts alongside the edit graph.

Older projects migrate with an empty agent audit array. PhiForm does not invent missing history.

## Qualification

`npm run agent:contract` verifies:

- read-only capability succeeds
- ungranted transform is rejected without mutation
- stale workspace revision is rejected
- unknown mesh ID is rejected
- valid mesh target is accepted
- graph mutation is capability-scoped
- neural edit intent remains recorded-only
- export returns dispatched state/effect
- duplicate command IDs are rejected

## Deliberate non-capabilities

Rung 6 does not expose:

- arbitrary JavaScript evaluation
- arbitrary DOM clicking
- shell/process execution
- direct filesystem access
- unrestricted network access
- model weight management
- silent capability escalation
- direct mutation outside the workspace/edit graph

Those are not omissions to work around. They are authority boundaries.
