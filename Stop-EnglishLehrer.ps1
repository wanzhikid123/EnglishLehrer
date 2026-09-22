$ErrorActionPreference = 'Stop'
$port = if ($env:ENGLISH_PORT) { [int]$env:ENGLISH_PORT } else { 3210 }
$localUrl = "http://127.0.0.1:$port"
try {
  $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 3
} catch {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is occupied but EnglishLehrer did not respond. No process was stopped."
  }
  Write-Host 'EnglishLehrer is already stopped.'
  exit 0
}
if ($health.app -ne 'EnglishLehrer') { throw 'This port belongs to another application. No process was stopped.' }
# The server verifies this exact folder before saving and closing its sessions.
$body = @{ directory = $PSScriptRoot } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "$localUrl/api/shutdown" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 5 | Out-Null
for ($attempt = 0; $attempt -lt 240; $attempt++) {
  if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
    Write-Host 'EnglishLehrer has stopped. You can close its browser tab.'
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
throw 'EnglishLehrer is still finishing its requests. Please try again shortly.'
