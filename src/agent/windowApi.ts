import type {
  AgentCapability,
  AgentCommand,
  AgentCommandName,
  AgentReceipt,
  AgentStateFingerprint,
} from './types'
import { AGENT_COMMAND_CAPABILITY } from './engine'
import type { MeshTarget } from '../core/types'

export interface PhiFormAgentDescriptor {
  schema: 'phiform.agent-descriptor.v1'
  version: '0.6.0'
  commands: Array<{
    command: AgentCommandName
    capability: AgentCapability
  }>
  grantedCapabilities: AgentCapability[]
  state: AgentStateFingerprint
  meshTargets: MeshTarget[]
}

export interface PhiFormAgentApi {
  describe(): PhiFormAgentDescriptor
  submit(command: unknown): AgentReceipt
}

declare global {
  interface Window {
    PhiFormAgent?: PhiFormAgentApi
  }
}

export function commandCatalog(): PhiFormAgentDescriptor['commands'] {
  return Object.entries(AGENT_COMMAND_CAPABILITY).map(
    ([command, capability]) => ({
      command: command as AgentCommandName,
      capability,
    }),
  )
}

export function installPhiFormAgentApi(
  describe: () => PhiFormAgentDescriptor,
  submit: (command: unknown) => AgentReceipt,
): () => void {
  const api: PhiFormAgentApi = {
    describe,
    submit,
  }
  window.PhiFormAgent = api

  return () => {
    if (window.PhiFormAgent === api) {
      delete window.PhiFormAgent
    }
  }
}

export type { AgentCommand }
