import type {
  EnginePackReceipt,
  EngineTarget,
} from '../core/types'

interface EnginePackPanelProps {
  engine: EngineTarget
  busy: boolean
  receipts: readonly EnginePackReceipt[]
  onEngineChange: (engine: EngineTarget) => void
  onBuild: () => void
}

export function EnginePackPanel({
  engine,
  busy,
  receipts,
  onEngineChange,
  onBuild,
}: EnginePackPanelProps) {
  const latest = receipts.at(-1)

  return (
    <div className="engine-card">
      <div className="engine-head">
        <div>
          <span className="eyebrow">ENGINE ASSET PACK</span>
          <strong>{engine === 'godot' ? 'Godot' : 'Unreal Engine'}</strong>
        </div>
        <span>
          {latest
            ? \`\${receipts.length} RECEIPT\${receipts.length === 1 ? '' : 'S'}\`
            : 'NO PACKS'}
        </span>
      </div>

      <div className="engine-switch">
        <button
          className={engine === 'godot' ? 'active' : ''}
          onClick={() => onEngineChange('godot')}
        >
          GODOT
        </button>
        <button
          className={engine === 'unreal' ? 'active' : ''}
          onClick={() => onEngineChange('unreal')}
        >
          UNREAL
        </button>
      </div>

      <div className="engine-conventions">
        {engine === 'godot' ? (
          <>
            <span>GLB import</span>
            <span>-convcolonly collision suffix</span>
            <span>Godot Game LOD policy</span>
          </>
        ) : (
          <>
            <span>GLB / Interchange import</span>
            <span>UBX_ collision prefixes</span>
            <span>Unreal Game LOD policy</span>
          </>
        )}
      </div>

      <button
        className="engine-build"
        disabled={busy}
        onClick={onBuild}
      >
        {busy ? 'PACKING ENGINE ASSET…' : 'BUILD ENGINE ZIP + RECEIPT'}
      </button>

      <p className="engine-caveat">
        Pack contains standard GLB assets, collision naming, LOD files,
        import notes, and a manifest. PhiForm does not claim to create native
        .uasset, .tscn, or .scn files in this rung.
      </p>

      {latest && (
        <div className="engine-receipt">
          <span>LATEST ENGINE PACK RECEIPT</span>
          <strong>{latest.engine} · {latest.packageFilename}</strong>
          <small>
            {latest.files.length} files · {latest.packageByteLength.toLocaleString()} bytes
          </small>
          <p>{latest.packageSha256.slice(0, 20)}…</p>
          <p>{latest.manifest.collision.nodeNames.length} collision proxies</p>
        </div>
      )}
    </div>
  )
}
