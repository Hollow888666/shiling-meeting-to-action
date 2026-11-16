param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$publicPort = 8766
$codePath = Join-Path $root ".public_access_code"
$statePath = Join-Path $root ".public_tunnel.json"

if (-not (Test-Path -LiteralPath $codePath)) {
    $chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    $code = -join (1..12 | ForEach-Object {
        $chars[(Get-Random -Minimum 0 -Maximum $chars.Length)]
    })
    Set-Content -LiteralPath $codePath -Value $code -Encoding ASCII -NoNewline
}
$code = (Get-Content -LiteralPath $codePath -Raw).Trim()

$listener = Get-NetTCPConnection -LocalPort $publicPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
if (-not $listener) {
    $env:SHILING_ACCESS_CODE = $code
    $python = Get-Command python.exe -ErrorAction Stop
    Start-Process `
        -FilePath $python.Source `
        -ArgumentList @("server.py", "--host", "127.0.0.1", "--port", "$publicPort") `
        -WorkingDirectory $root `
        -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 300
        $listener = Get-NetTCPConnection -LocalPort $publicPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($listener) {
            break
        }
    }
}
if (-not $listener) {
    throw "Public server did not start."
}

$state = $null
if (Test-Path -LiteralPath $statePath) {
    try {
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    }
    catch {
        $state = $null
    }
}

$tunnel = $null
if ($state -and $state.sshPid) {
    $tunnel = Get-Process -Id ([int]$state.sshPid) -ErrorAction SilentlyContinue
}

if (-not $tunnel -or -not $state.publicUrl) {
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $outLog = Join-Path $root "data\public_tunnel_$stamp.out.log"
    $errLog = Join-Path $root "data\public_tunnel_$stamp.err.log"
    $ssh = Start-Process `
        -FilePath "C:\WINDOWS\System32\OpenSSH\ssh.exe" `
        -ArgumentList @(
            "-o", "StrictHostKeyChecking=no",
            "-o", "UserKnownHostsFile=NUL",
            "-o", "ExitOnForwardFailure=yes",
            "-o", "ServerAliveInterval=30",
            "-R", "80:127.0.0.1:$publicPort",
            "serveo.net"
        ) `
        -WorkingDirectory $root `
        -WindowStyle Hidden `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -PassThru

    $publicUrl = ""
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        $text = ""
        if (Test-Path -LiteralPath $outLog) {
            $text += Get-Content -LiteralPath $outLog -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $errLog) {
            $text += Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue
        }
        $match = [regex]::Match(
            $text,
            "https://[a-z0-9-]+\.serveousercontent\.com"
        )
        if ($match.Success) {
            $publicUrl = $match.Value
            break
        }
    }
    if (-not $publicUrl) {
        Stop-Process -Id $ssh.Id -Force -ErrorAction SilentlyContinue
        throw "Public tunnel did not return an address."
    }

    $state = [pscustomobject]@{
        sshPid = $ssh.Id
        publicUrl = $publicUrl
        outLog = $outLog
        errLog = $errLog
        startedAt = (Get-Date).ToString("s")
    }
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
}

$accessUrl = "$($state.publicUrl)/?access=$code"
Write-Host ""
Write-Host "Shiling public demo is ready." -ForegroundColor Green
Write-Host "Public: $($state.publicUrl)"
Write-Host "Access: $accessUrl"
Write-Host ""
Write-Host "Keep this computer awake and online while the demo is in use."

if (-not $NoBrowser) {
    Start-Process $accessUrl
}
