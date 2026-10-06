param(
  [Parameter(Mandatory = $true)]
  [string]$Sf3dDir,

  [string]$Python = "python",
  [string]$Device = "",
  [int]$TextureResolution = 1024,
  [ValidateSet("none", "triangle", "quad")]
  [string]$Remesh = "none",
  [int]$TargetVertexCount = -1
)

$ErrorActionPreference = "Stop"

$resolved = (Resolve-Path $Sf3dDir).Path
$runPy = Join-Path $resolved "run.py"

if (-not (Test-Path $runPy)) {
  throw "Stable Fast 3D run.py was not found at $runPy"
}

$env:PHIFORM_SF3D_DIR = $resolved
$env:PHIFORM_SF3D_PYTHON = $Python
$env:PHIFORM_SF3D_TEXTURE_RESOLUTION = "$TextureResolution"
$env:PHIFORM_SF3D_REMESH = $Remesh
$env:PHIFORM_SF3D_TARGET_VERTEX_COUNT = "$TargetVertexCount"

if ($Device) {
  $env:PHIFORM_SF3D_DEVICE = $Device
} else {
  Remove-Item Env:PHIFORM_SF3D_DEVICE -ErrorAction SilentlyContinue
}

Write-Host "PhiForm SF3D bridge configuration"
Write-Host "  SF3D:   $resolved"
Write-Host "  Python: $Python"
Write-Host "  Device: $(if ($Device) { $Device } else { 'SF3D auto-detect' })"
Write-Host "  Texture: $TextureResolution"
Write-Host "  Remesh: $Remesh"

npm run sf3d:check
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

npm run bridge
