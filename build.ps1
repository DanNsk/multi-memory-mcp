# Build script for Windows
# Usage: .\build.ps1

Write-Host "Building multi-memory-mcp..." -ForegroundColor Cyan

# Check if bun is installed
if (!(Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Bun is not installed. Please install Bun first:" -ForegroundColor Red
    Write-Host "  powershell -c 'irm bun.sh/install.ps1 | iex'" -ForegroundColor Yellow
    exit 1
}

# Install dependencies if node_modules doesn't exist
if (!(Test-Path "node_modules")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    bun install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
}

# Run TypeScript compiler
Write-Host "Compiling TypeScript..." -ForegroundColor Yellow
bun run build:tsc
if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript compilation failed" -ForegroundColor Red
    exit 1
}

Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now run the server with:" -ForegroundColor Cyan
Write-Host "  node dist/index.js" -ForegroundColor White
