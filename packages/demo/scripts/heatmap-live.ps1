<#
.SYNOPSIS
  Run the UK heatmap worker locally and expose it to the live app so /map
  fills in as each point is computed.

.DESCRIPTION
  Starts the worker (serves the growing grid on http://localhost:<Port>/heatmap.json),
  opens a public HTTPS tunnel to it, and prints/opens the /map?src=... URL on the
  deployed site. Uses Cloudflare Tunnel if `cloudflared` is installed, otherwise
  falls back to ssh -> localhost.run (built into Windows 10/11, no install).

  The deployed page polls the feed every few seconds, so the map fills in live.
  Leave this window (and the worker window it opens) running. Close them to stop.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File packages\demo\scripts\heatmap-live.ps1

.PARAMETER AppUrl
  Base URL of the deployed app. Default: https://wind.jamieblair.co.uk

.PARAMETER Port
  Local port the worker serves on. Default: 8088
#>
param(
  [string]$AppUrl = 'https://wind.jamieblair.co.uk',
  [int]$Port = 8088
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$log = Join-Path $env:TEMP 'wf-tunnel.log'
Remove-Item $log -Force -ErrorAction SilentlyContinue

Write-Host 'Building core (one-off; cached after the first run)...' -ForegroundColor Cyan
Push-Location $repo
try { & pnpm --filter '@jamieblair/windforge-core' build | Out-Null } finally { Pop-Location }

Write-Host 'Starting the heatmap worker in a new window...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
  '-NoExit', '-Command',
  "Set-Location '$repo'; `$env:PORT=$Port; pnpm --filter '@jamieblair/windforge-demo' heatmap"
)

if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
  Write-Host 'Opening Cloudflare tunnel...' -ForegroundColor Cyan
  Start-Process cloudflared -WindowStyle Minimized -ArgumentList @(
    'tunnel', '--url', "http://localhost:$Port", '--logfile', $log
  )
  $pattern = 'https://[a-z0-9-]+\.trycloudflare\.com'
}
else {
  Write-Host 'cloudflared not found - using ssh -> localhost.run (no install needed)...' -ForegroundColor Cyan
  Start-Process ssh -WindowStyle Minimized -RedirectStandardError $log -ArgumentList @(
    '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30',
    '-R', "80:localhost:$Port", 'nokey@localhost.run'
  )
  $pattern = 'https://\S+?\.(lhr\.life|localhost\.run)'
}

Write-Host 'Waiting for the public tunnel URL...' -ForegroundColor Cyan
$publicUrl = $null
for ($i = 0; $i -lt 90; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path $log) {
    $hit = Select-String -Path $log -Pattern $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($hit) { $publicUrl = $hit.Matches[0].Value.TrimEnd('/'); break }
  }
}

if (-not $publicUrl) {
  Write-Host "Could not auto-detect the tunnel URL. Open $log to find it, then visit:" -ForegroundColor Yellow
  Write-Host "  $AppUrl/map?src=<TUNNEL_URL>/heatmap.json"
  exit 1
}

$mapUrl = "$AppUrl/map?src=$publicUrl/heatmap.json"
Write-Host ''
Write-Host '================  LIVE HEATMAP  ================' -ForegroundColor Green
Write-Host "  $mapUrl" -ForegroundColor Green
Write-Host '================================================' -ForegroundColor Green
Write-Host 'Opening it in your browser. Keep this window and the worker window open.'
Start-Process $mapUrl
