# Stable Fast 3D backend

PhiForm Rung 3 integrates Stability AI's **Stable Fast 3D (SF3D)** as the first real neural image-to-3D backend.

PhiForm does **not** redistribute SF3D code, model weights, or the Stability AI license. The bridge launches an operator-installed SF3D checkout through its official `run.py` interface and then imports the resulting `output/0/mesh.glb`.

Upstream:

- Repository: https://github.com/Stability-AI/stable-fast-3d
- Model: https://huggingface.co/stabilityai/stable-fast-3d
- License: Stability AI Community License, as published upstream

Read and accept the upstream terms before using the model.

## What SF3D does

The upstream model reconstructs a textured, UV-unwrapped 3D mesh from a single image. PhiForm treats it as:

```text
kind: neural
textTo3D: false
imageTo3D: true
multiView: false
glbOutput: true
```

A text prompt may still be stored in the PhiForm request/receipt as operator metadata, but it is not represented as an SF3D conditioning input.

## Upstream prerequisites

Follow Stability AI's current installation instructions. At the time this adapter was written, upstream documents:

- Python 3.8 or newer
- PyTorch appropriate for the local platform/CUDA installation
- `setuptools==69.5.1` and `wheel`
- `pip install -r requirements.txt`
- Visual Studio 2022 for the upstream experimental Windows path
- gated Hugging Face model access and a Hugging Face login/token
- about 6 GB VRAM for the default single-image inference path

Do not treat this document as a replacement for upstream installation instructions.

## Windows example

Clone/install SF3D separately. A typical layout might be:

```text
C:\AI\stable-fast-3d\
  run.py
  sf3d\
  texture_baker\
  uv_unwrapper\
  ...
```

If you created a virtual environment inside the checkout, start PhiForm's bridge with:

```powershell
.\scripts\start-sf3d-bridge.ps1 `
  -Sf3dDir "C:\AI\stable-fast-3d" `
  -Python "C:\AI\stable-fast-3d\.venv\Scripts\python.exe"
```

Or set the environment manually:

```powershell
$env:PHIFORM_SF3D_DIR = "C:\AI\stable-fast-3d"
$env:PHIFORM_SF3D_PYTHON = "C:\AI\stable-fast-3d\.venv\Scripts\python.exe"
npm run sf3d:check
npm run bridge
```

Then run the PhiForm web studio separately:

```powershell
npm run dev
```

Switch **Inference Path** to **Local Bridge**, connect to `http://127.0.0.1:8787`, choose **Stable Fast 3D**, attach one image, and generate.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PHIFORM_SF3D_DIR` | unset | Path to the operator-installed SF3D checkout |
| `PHIFORM_SF3D_PYTHON` | `python` on Windows, `python3` elsewhere | Python executable used to invoke upstream `run.py` |
| `PHIFORM_SF3D_DEVICE` | upstream auto-detect | Optional `cuda`, `mps`, or `cpu` override |
| `PHIFORM_SF3D_TEXTURE_RESOLUTION` | `1024` | Passed to `--texture-resolution` |
| `PHIFORM_SF3D_REMESH` | `none` | `none`, `triangle`, or `quad` |
| `PHIFORM_SF3D_TARGET_VERTEX_COUNT` | `-1` | Passed to upstream target vertex count |
| `PHIFORM_SF3D_PRETRAINED_MODEL` | upstream default | Optional Hugging Face model ID or local model path |

`PHIFORM_SF3D_RUN_SCRIPT` exists as a bridge qualification hook. Normal users should leave it unset so PhiForm invokes the checkout's official `run.py`.

## Provenance

A successful SF3D job records:

- backend ID `stability.sf3d.v1`
- bridge job ID
- model identity
- upstream source URL
- upstream license label
- exact output byte length
- SHA-256 of the exact served GLB bytes
- a request fingerprint

The request fingerprint is **not** described as an SF3D inference RNG seed because upstream `run.py` exposes no seed option.

## CI qualification boundary

GitHub Actions does not download gated SF3D weights or claim to run the neural model.

CI uses a tiny CLI-shape fixture to prove that PhiForm can:

1. discover the SF3D backend,
2. transfer image bytes,
3. launch an external runner with the same output contract,
4. wait for completion,
5. load `output/0/mesh.glb`,
6. validate GLB framing,
7. hash the resulting bytes,
8. expose the artifact through the normal bridge job API.

A physical/local run with the actual model is a separate qualification step.
