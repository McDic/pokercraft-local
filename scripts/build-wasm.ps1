$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$wasmCrate = Join-Path $projectRoot "crates\wasm"
$webWasmDir = Join-Path $projectRoot "web\src\wasm"

Write-Host "=== Building WASM module ==="
Write-Host "Project root: $projectRoot"
Write-Host "WASM crate: $wasmCrate"
Write-Host "Output dir: $webWasmDir"
Write-Host ""

if (-not (Get-Command wasm-pack -ErrorAction SilentlyContinue)) {
    Write-Error "wasm-pack is not installed. Install it with: cargo install wasm-pack"
}

Push-Location $wasmCrate
try {
    Write-Host "Running wasm-pack build..."
    wasm-pack build --target web --out-dir $webWasmDir
}
finally {
    Pop-Location
}

$generatedGitignore = Join-Path $webWasmDir ".gitignore"
$generatedPackageJson = Join-Path $webWasmDir "package.json"

if (Test-Path $generatedGitignore) {
    Remove-Item $generatedGitignore -Force
}

if (Test-Path $generatedPackageJson) {
    Remove-Item $generatedPackageJson -Force
}

Write-Host ""
Write-Host "=== WASM build complete ==="
Get-ChildItem $webWasmDir | Select-Object Name, Length
