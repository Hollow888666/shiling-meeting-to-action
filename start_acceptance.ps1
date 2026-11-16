param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$port = 8765
$localUrl = "http://127.0.0.1:$port"

$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener) {
    $python = Get-Command python.exe -ErrorAction Stop
    Start-Process `
        -FilePath $python.Source `
        -ArgumentList @("server.py", "--host", "0.0.0.0", "--port", "$port") `
        -WorkingDirectory $root `
        -WindowStyle Hidden
}

$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 2
        if ($health.ok) {
            $ready = $true
            break
        }
    }
    catch {
        Start-Sleep -Milliseconds 300
    }
}

if (-not $ready) {
    throw "Backend did not start. Run start_server.bat to inspect the error."
}

Write-Host ""
Write-Host "Shiling Meeting to Action is ready." -ForegroundColor Green
Write-Host "Computer: $localUrl"

$lanAddresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*"
    } |
    Select-Object -ExpandProperty IPAddress -Unique

foreach ($address in $lanAddresses) {
    Write-Host "Phone:    http://${address}:$port"
}

Write-Host ""
Write-Host "Keep the computer and phone on the same Wi-Fi or hotspot."

if (-not $NoBrowser) {
    Start-Process $localUrl
}
