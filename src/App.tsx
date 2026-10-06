import { useMemo, useState } from 'react'
import { Viewport } from './components/Viewport'
import { receiptChecksum, receiptText } from './core/receipt'
import type { GenerationReceipt, ImageSource, ModelArtifact } from './core/types'
import type { BridgeBackend } from './neural/bridgeTypes'
import { LocalBridgeAdapter } from './neural/localBridgeAdapter'
import { LocalBridgeClient } from './neural/localBridgeClient'
import { mockAdapter } from './neural/mockAdapter'

const initialArtifact: ModelArtifact = {
  kind: 'primitive',
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
  const [imageFile, setImageFile] = useState<File | undefined>()
  const [artifact, setArtifact] = useState<ModelArtifact>(initialArtifact)
  const [receipts, setReceipts] = useState<GenerationReceipt[]>([])
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState<'proof' | 'bridge'>('proof')
  const [endpoint, setEndpoint] = useState('http://127.0.0.1:8787')
  const [backends, setBackends] = useState<BridgeBackend[]>([])
  const [backendId, setBackendId] = useState('')
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'checking' | 'online' | 'error'>('idle')
  const [error, setError] = useState('')

  const latestReceipt = receipts[0]
  const checksum = useMemo(
    () => (latestReceipt ? receiptChecksum(latestReceipt) : 'no receipt yet'),
    [latestReceipt],
  )
  const selectedBackend = backends.find((backend) => backend.id === backendId)

  const connectBridge = async () => {
    setBridgeStatus('checking')
    setError('')
    try {
      const client = new LocalBridgeClient(endpoint)
      await client.health()
      const available = (await client.backends()).filter((backend) => backend.available)
      setBackends(available)
      setBackendId((current) =>
        available.some((backend) => backend.id === current)
          ? current
          : available[0]?.id ?? '',
      )
      setBridgeStatus('online')
    } catch (cause) {
      setBackends([])
      setBackendId('')
      setBridgeStatus('error')
      setError(cause instanceof Error ? cause.message : 'Bridge connection failed.')
    }
  }

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const adapter =
        mode === 'proof'
          ? mockAdapter
          : selectedBackend
            ? new LocalBridgeAdapter(endpoint, selectedBackend)
            : undefined

      if (!adapter) {
        throw new Error('Connect the local bridge and select an available backend first.')
      }

      const result = await adapter.generate({ prompt, image }, { imageFile })
      setArtifact(result.artifact)
      setReceipts((current) => [result.receipt, ...current].slice(0, 12))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  const selectImage = (file?: File) => {
    setImageFile(file)
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

  const artifactType = artifact.kind === 'glb' ? 'GLB' : artifact.primitive
  const artifactDetail =
    artifact.kind === 'glb'
      ? artifact.backendId
      : artifact.scale.map((value) => value.toFixed(2)).join(' / ')

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
          <span className="pill"><i /> RUNG 2</span>
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
            <button className="text-button" onClick={() => selectImage(undefined)}>
              remove image binding
            </button>
          )}

          <div className="adapter-card">
            <span className="eyebrow">INFERENCE PATH</span>
            <div className="mode-switch">
              <button
                className={mode === 'proof' ? 'active' : ''}
                onClick={() => setMode('proof')}
              >
                PROOF
              </button>
              <button
                className={mode === 'bridge' ? 'active' : ''}
                onClick={() => setMode('bridge')}
              >
                LOCAL BRIDGE
              </button>
            </div>

            {mode === 'proof' ? (
              <>
                <strong>{mockAdapter.label}</strong>
                <p>
                  Deterministic procedural path. No neural inference is claimed.
                </p>
                <div className="capabilities">
                  <span>TEXT</span>
                  <span>LOCAL</span>
                  <span className="off">IMAGE PIXELS</span>
                  <span className="off">GLB OUT</span>
                </div>
              </>
            ) : (
              <div className="bridge-config">
                <label className="field-label" htmlFor="bridge-endpoint">BRIDGE ENDPOINT</label>
                <input
                  id="bridge-endpoint"
                  type="text"
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.target.value)}
                />
                <button className="connect" disabled={bridgeStatus === 'checking'} onClick={connectBridge}>
                  {bridgeStatus === 'checking' ? 'CHECKING…' : 'CONNECT / REFRESH'}
                </button>

                <div className={`bridge-state ${bridgeStatus}`}>
                  <span />
                  {bridgeStatus.toUpperCase()}
                </div>

                {backends.length > 0 && (
                  <>
                    <label className="field-label" htmlFor="backend">BACKEND</label>
                    <select
                      id="backend"
                      value={backendId}
                      onChange={(event) => setBackendId(event.target.value)}
                    >
                      {backends.map((backend) => (
                        <option key={backend.id} value={backend.id}>
                          {backend.label} · {backend.kind}
                        </option>
                      ))}
                    </select>
                    {selectedBackend && (
                      <p>
                        {selectedBackend.model ?? selectedBackend.id}
                        {selectedBackend.license ? ` · ${selectedBackend.license}` : ''}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {error && <div className="error-strip">{error}</div>}

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
              <span>{artifactType}</span>
              {artifact.kind === 'primitive' ? (
                <>
                  <span>{artifact.material.metalness.toFixed(2)} metal</span>
                  <span>{artifact.material.roughness.toFixed(2)} rough</span>
                </>
              ) : (
                <>
                  <span>{artifact.byteLength ? bytes(artifact.byteLength) : 'size unknown'}</span>
                  <span>{artifact.sha256 ? `sha256 ${artifact.sha256.slice(0, 10)}…` : 'hash absent'}</span>
                </>
              )}
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
              <strong>{artifactType}</strong>
            </div>
            <div>
              <span>{artifact.kind === 'glb' ? 'BACKEND' : 'SCALE'}</span>
              <strong>{artifactDetail}</strong>
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
              <div><dt>job</dt><dd>{latestReceipt?.jobId ?? '—'}</dd></div>
              <div><dt>sha256</dt><dd>{latestReceipt?.output?.sha256 ?? '—'}</dd></div>
              <div><dt>checksum</dt><dd>{checksum}</dd></div>
            </dl>
          </div>

          <div className="authority-note">
            <span>CAPABILITY ≠ AUTHORITY</span>
            <p>
              Local backends return candidate artifacts. PhiForm decides what enters
              workspace state and records the backend, job, hash, and caveats.
            </p>
          </div>

          <div className="roadmap-mini">
            <span className="eyebrow">RUNG 2 CONTRACT</span>
            <strong>Bridge → job → GLB → receipt</strong>
            <p>
              The bundled development bridge emits a real GLB for qualification but
              explicitly identifies itself as procedural proof, not neural inference.
            </p>
          </div>
        </aside>
      </section>
    </main>
  )
}
