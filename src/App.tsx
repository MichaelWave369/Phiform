import { useMemo, useState } from 'react'
import { Viewport } from './components/Viewport'
import { receiptChecksum, receiptText } from './core/receipt'
import type { GenerationReceipt, ImageSource, ModelArtifact } from './core/types'
import { mockAdapter } from './neural/mockAdapter'

const initialArtifact: ModelArtifact = {
  id: 'artifact-bootstrap',
  label: 'PhiForm seed',
  primitive: 'torus',
  seed: 369,
  scale: [1, 1, 1],
  material: { metalness: 0.38, roughness: 0.42 },
  createdAt: new Date().toISOString(),
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function App() {
  const [prompt, setPrompt] = useState('luminous nested portal machine')
  const [image, setImage] = useState<ImageSource | undefined>()
  const [artifact, setArtifact] = useState<ModelArtifact>(initialArtifact)
  const [receipts, setReceipts] = useState<GenerationReceipt[]>([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const latestReceipt = receipts[0]
  const checksum = useMemo(
    () => (latestReceipt ? receiptChecksum(latestReceipt) : 'no receipt yet'),
    [latestReceipt],
  )

  const generate = async () => {
    setBusy(true)
    try {
      const result = await mockAdapter.generate({ prompt, image })
      setArtifact(result.artifact)
      setReceipts((current) => [result.receipt, ...current].slice(0, 12))
    } finally {
      setBusy(false)
    }
  }

  const selectImage = (file?: File) => {
    if (!file) {
      setImage(undefined)
      return
    }
    setImage({ name: file.name, type: file.type || 'unknown', size: file.size })
  }

  const copyReceipt = async () => {
    if (!latestReceipt) return
    await navigator.clipboard.writeText(receiptText(latestReceipt))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">Φ</div>
          <div>
            <strong>PhiForm</strong>
            <span>Neural 3D Workbench</span>
          </div>
        </div>

        <div className="top-status">
          <span className="pill"><i /> RUNG 1</span>
          <span className="pill muted">AUTHORITY: WORKSPACE</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="panel input-panel">
          <div className="panel-heading">
            <span>01</span>
            <div>
              <h2>Intent</h2>
              <p>Describe or attach a source.</p>
            </div>
          </div>

          <label className="field-label" htmlFor="prompt">FORM PROMPT</label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe an object, prop, creature, machine..."
          />

          <label className="upload">
            <input
              type="file"
              accept="image/*"
              onChange={(event) => selectImage(event.target.files?.[0])}
            />
            <span className="upload-icon">+</span>
            <span>
              <strong>{image ? image.name : 'Attach reference image'}</strong>
              <small>
                {image ? `${image.type} · ${bytes(image.size)}` : 'PNG / JPG / WEBP'}
              </small>
            </span>
          </label>

          {image && (
            <button className="text-button" onClick={() => setImage(undefined)}>
              remove image binding
            </button>
          )}

          <div className="adapter-card">
            <span className="eyebrow">ACTIVE ADAPTER</span>
            <strong>{mockAdapter.label}</strong>
            <p>
              Deterministic procedural proof path. It exercises the studio without
              falsely claiming neural inference.
            </p>
            <div className="capabilities">
              <span>TEXT</span>
              <span>LOCAL</span>
              <span className="off">IMAGE PIXELS</span>
              <span className="off">MESH OUT</span>
            </div>
          </div>

          <button className="generate" disabled={busy} onClick={generate}>
            <span>{busy ? 'FORMING…' : 'GENERATE FORM'}</span>
            <b>↗</b>
          </button>
        </aside>

        <section className="stage">
          <div className="stage-meta">
            <span>ARTIFACT / {artifact.id.slice(0, 22)}</span>
            <span>SEED {artifact.seed}</span>
          </div>
          <Viewport artifact={artifact} />
          <div className="stage-footer">
            <div>
              <span className="eyebrow">CURRENT FORM</span>
              <strong>{artifact.label}</strong>
            </div>
            <div className="stage-stats">
              <span>{artifact.primitive}</span>
              <span>{artifact.material.metalness.toFixed(2)} metal</span>
              <span>{artifact.material.roughness.toFixed(2)} rough</span>
            </div>
          </div>
        </section>

        <aside className="panel inspector-panel">
          <div className="panel-heading">
            <span>02</span>
            <div>
              <h2>Evidence</h2>
              <p>Artifact state and generation lineage.</p>
            </div>
          </div>

          <div className="metric-grid">
            <div>
              <span>TYPE</span>
              <strong>{artifact.primitive}</strong>
            </div>
            <div>
              <span>SCALE</span>
              <strong>{artifact.scale.map((v) => v.toFixed(2)).join(' / ')}</strong>
            </div>
            <div>
              <span>ADAPTER</span>
              <strong>{latestReceipt?.adapterId ?? 'bootstrap'}</strong>
            </div>
            <div>
              <span>RECEIPTS</span>
              <strong>{receipts.length}</strong>
            </div>
          </div>

          <div className="receipt">
            <div className="receipt-head">
              <div>
                <span className="eyebrow">LATEST RECEIPT</span>
                <strong>{latestReceipt?.id ?? 'No generation yet'}</strong>
              </div>
              <button disabled={!latestReceipt} onClick={copyReceipt}>
                {copied ? 'COPIED' : 'COPY'}
              </button>
            </div>

            <dl>
              <div><dt>schema</dt><dd>{latestReceipt?.schema ?? '—'}</dd></div>
              <div><dt>status</dt><dd>{latestReceipt?.status ?? '—'}</dd></div>
              <div><dt>seed</dt><dd>{latestReceipt?.seed ?? '—'}</dd></div>
              <div><dt>checksum</dt><dd>{checksum}</dd></div>
            </dl>
          </div>

          <div className="authority-note">
            <span>CAPABILITY ≠ AUTHORITY</span>
            <p>
              Adapters propose. PhiForm owns the project state. Generated output does
              not silently overwrite source material or claim provenance it cannot prove.
            </p>
          </div>

          <div className="roadmap-mini">
            <span className="eyebrow">NEXT CONNECTION</span>
            <strong>Real image → 3D adapter</strong>
            <p>Local service bridge + GLB ingestion while preserving this receipt contract.</p>
          </div>
        </aside>
      </section>
    </main>
  )
}
