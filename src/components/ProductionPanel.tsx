import type {
  ProductionAudit,
  ProductionProfileId,
  ProductionReceipt,
} from '../core/types'
import { PRODUCTION_PROFILES } from '../production/profiles'

interface ProductionPanelProps {
  profileId: ProductionProfileId
  audit?: ProductionAudit
  receipts: readonly ProductionReceipt[]
  busy: boolean
  onProfileChange: (profileId: ProductionProfileId) => void
  onBuild: () => void
}

function statusLabel(audit?: ProductionAudit): string {
  if (!audit) return 'NO AUDIT'
  return audit.qualification.toUpperCase()
}

export function ProductionPanel({
  profileId,
  audit,
  receipts,
  busy,
  onProfileChange,
  onBuild,
}: ProductionPanelProps) {
  const profile = PRODUCTION_PROFILES[profileId]
  const latest = receipts.at(-1)

  return (
    <div className="production-card">
      <div className="production-head">
        <div>
          <span className="eyebrow">PRODUCTION QUALIFICATION</span>
          <strong>{profile.label}</strong>
        </div>
        <span className={audit?.qualification ?? 'none'}>
          {statusLabel(audit)}
        </span>
      </div>

      <label className="field-label" htmlFor="production-profile">
        EXPORT PROFILE
      </label>
      <select
        id="production-profile"
        value={profileId}
        onChange={(event) =>
          onProfileChange(event.target.value as ProductionProfileId)
        }
      >
        {Object.values(PRODUCTION_PROFILES).map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </select>

      <div className="production-profile-meta">
        <span>
          TRI BUDGET ·{' '}
          {profile.maxTriangles === null
            ? 'PRESERVE'
            : profile.maxTriangles.toLocaleString()}
        </span>
        <span>
          LODS · {profile.lodRatios.map((ratio) => ratio.toFixed(2)).join(' / ')}
        </span>
      </div>

      {audit && (
        <>
          <div className="production-metrics">
            <div><span>TRIANGLES</span><strong>{audit.totals.triangles.toLocaleString()}</strong></div>
            <div><span>VERTICES</span><strong>{audit.totals.vertices.toLocaleString()}</strong></div>
            <div><span>DEGENERATE</span><strong>{audit.totals.degenerateTriangles}</strong></div>
            <div><span>BOUNDARY</span><strong>{audit.totals.boundaryEdges}</strong></div>
            <div><span>NON-MANIFOLD</span><strong>{audit.totals.nonManifoldEdges}</strong></div>
            <div><span>BAD VERTS</span><strong>{audit.totals.invalidVertices}</strong></div>
            <div><span>NO NORMALS</span><strong>{audit.totals.meshesMissingNormals}</strong></div>
            <div><span>NO UVS</span><strong>{audit.totals.meshesMissingUvs}</strong></div>
          </div>

          <div className="production-notes">
            {audit.notes.slice(0, 5).map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </>
      )}

      <button
        className="production-build"
        disabled={busy}
        onClick={onBuild}
      >
        {busy ? 'BUILDING PRODUCTION PACK…' : 'BUILD + HASH PRODUCTION PACK'}
      </button>

      <p className="production-caveat">
        Repairs are conservative. PhiForm may recompute normals and remove
        provably degenerate indexed triangles. Open or non-manifold topology is
        reported, not magically healed.
      </p>

      {latest && (
        <div className="production-receipt">
          <span>LATEST PRODUCTION RECEIPT</span>
          <strong>{latest.profileId} · {latest.qualification}</strong>
          <small>{latest.files.length} files · {latest.id}</small>
          {latest.files.map((file) => (
            <p key={file.filename}>
              LOD{file.lod} · {file.triangles.toLocaleString()} tris ·{' '}
              {file.sha256.slice(0, 12)}…
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
