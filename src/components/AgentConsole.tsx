import { useMemo, useState } from 'react'
import {
  AGENT_CAPABILITIES,
  parseAgentCommand,
} from '../agent/engine'
import type {
  AgentCapability,
  AgentCommand,
  AgentReceipt,
  AgentStateFingerprint,
} from '../agent/types'
import type { MeshTarget } from '../core/types'

function commandId(): string {
  return crypto.randomUUID?.() ?? `cmd-${Date.now().toString(36)}`
}

function envelope(
  command: AgentCommand['command'],
  args: Record<string, unknown>,
  state: AgentStateFingerprint,
): string {
  return JSON.stringify(
    {
      schema: 'phiform.agent-command.v1',
      id: commandId(),
      agentId: 'phiform-console',
      command,
      args,
      expected: {
        artifactId: state.artifactId,
        nodeId: state.nodeId,
        revision: state.revision,
      },
    },
    null,
    2,
  )
}

interface AgentConsoleProps {
  state: AgentStateFingerprint
  meshTargets: MeshTarget[]
  grants: ReadonlySet<AgentCapability>
  receipts: readonly AgentReceipt[]
  onGrantChange: (capability: AgentCapability, enabled: boolean) => void
  onExecute: (command: AgentCommand) => AgentReceipt
}

export function AgentConsole({
  state,
  meshTargets,
  grants,
  receipts,
  onGrantChange,
  onExecute,
}: AgentConsoleProps) {
  const [text, setText] = useState(() =>
    envelope('workspace.read', {}, state),
  )
  const [error, setError] = useState('')
  const latest = receipts.at(-1)

  const examples = useMemo(
    () => ({
      read: () => envelope('workspace.read', {}, state),
      move: () =>
        envelope(
          'workspace.transform.set',
          { position: [0.5, 0, 0] },
          state,
        ),
      material: () =>
        envelope(
          'workspace.material.set',
          {
            enabled: true,
            color: '#b77cff',
            metalness: 0.55,
            roughness: 0.28,
          },
          state,
        ),
      mesh: () =>
        envelope(
          meshTargets[0] ? 'target.mesh' : 'target.artifact',
          meshTargets[0] ? { id: meshTargets[0].id } : {},
          state,
        ),
      branch: () =>
        envelope('graph.branch', { name: 'agent-variant' }, state),
      intent: () =>
        envelope(
          'neural.intent.record',
          {
            instruction: 'make the current target slightly wider and more mechanical',
            scope: 'current',
          },
          state,
        ),
      export: () =>
        envelope(
          'artifact.export.glb',
          { filename: 'agent-derived.glb' },
          state,
        ),
    }),
    [meshTargets, state],
  )

  const execute = () => {
    setError('')
    try {
      const parsed = JSON.parse(text) as unknown
      const command = parseAgentCommand(parsed)
      const receipt = onExecute(command)
      if (receipt.status === 'rejected') {
        setError(receipt.reason ?? 'Command rejected.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invalid agent command.')
    }
  }

  return (
    <div className="agent-card">
      <div className="agent-head">
        <div>
          <span className="eyebrow">AGENT COMMAND RAIL</span>
          <strong>window.PhiFormAgent</strong>
        </div>
        <span>{grants.size}/{AGENT_CAPABILITIES.length} GRANTED</span>
      </div>

      <div className="agent-capabilities">
        {AGENT_CAPABILITIES.map((capability) => (
          <label key={capability}>
            <input
              type="checkbox"
              checked={grants.has(capability)}
              onChange={(event) =>
                onGrantChange(capability, event.target.checked)
              }
            />
            {capability}
          </label>
        ))}
      </div>

      <div className="agent-examples">
        <button onClick={() => setText(examples.read())}>READ</button>
        <button onClick={() => setText(examples.move())}>MOVE</button>
        <button onClick={() => setText(examples.material())}>MATERIAL</button>
        <button onClick={() => setText(examples.mesh())}>TARGET</button>
        <button onClick={() => setText(examples.branch())}>BRANCH</button>
        <button onClick={() => setText(examples.intent())}>INTENT</button>
        <button onClick={() => setText(examples.export())}>EXPORT</button>
      </div>

      <textarea
        className="agent-command-input"
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      <button className="agent-execute" onClick={execute}>
        EXECUTE GOVERNED COMMAND
      </button>

      {error && <div className="agent-error">{error}</div>}

      <div className="agent-state">
        <span>
          {state.branch} · rev {state.revision} · {state.target}
        </span>
        <span>{meshTargets.length} mesh targets</span>
      </div>

      {latest && (
        <div className={`agent-receipt ${latest.status}`}>
          <span>LATEST AGENT RECEIPT</span>
          <strong>{latest.command}</strong>
          <small>
            {latest.status} · {latest.capability} · {latest.commandId}
          </small>
          {latest.reason && <p>{latest.reason}</p>}
        </div>
      )}
    </div>
  )
}
