import type { WorkspaceEditState } from './types'

export function defaultWorkspaceEdits(): WorkspaceEditState {
  return {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    material: {
      enabled: false,
      color: '#b8efff',
      metalness: 0.35,
      roughness: 0.45,
    },
    revision: 0,
  }
}

export function cloneWorkspaceEdits(edits: WorkspaceEditState): WorkspaceEditState {
  return {
    position: [...edits.position],
    rotation: [...edits.rotation],
    scale: [...edits.scale],
    material: { ...edits.material },
    revision: edits.revision,
  }
}

export function degrees(radians: number): number {
  return (radians * 180) / Math.PI
}

export function radians(degreesValue: number): number {
  return (degreesValue * Math.PI) / 180
}
