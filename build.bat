@echo off
REM Build script for Windows
REM Usage: build.bat

echo Building multi-memory-mcp...

REM Check if bun is available
where bun >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Bun is not installed. Please install Bun first:
    echo   powershell -c "irm bun.sh/install.ps1 | iex"
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    call bun install
    if %ERRORLEVEL% neq 0 (
        echo Failed to install dependencies
        exit /b 1
    )
)

REM Run TypeScript compiler
echo Compiling TypeScript...
call bun run build:tsc
if %ERRORLEVEL% neq 0 (
    echo TypeScript compilation failed
    exit /b 1
)

echo.
echo Build completed successfully!
echo.
echo You can now run the server with:
echo   node dist\index.js
