param([switch]$NoBrowser, [switch]$Restart)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Please install Node.js 24 LTS first: https://nodejs.org/' }
$major = [int]((node --version).TrimStart('v').Split('.')[0])
if ($major -lt 24) { throw 'EnglishLehrer requires Node.js 24 or newer.' }
# Load the existing Windows variable when this shell was opened before it was configured.
# Do not print, write, or pass the secret on a command line.
if ([string]::IsNullOrWhiteSpace($env:openai_api_key)) {
  $configuredKey = [Environment]::GetEnvironmentVariable('openai_api_key', 'User')
  if ([string]::IsNullOrWhiteSpace($configuredKey)) { $configuredKey = [Environment]::GetEnvironmentVariable('openai_api_key', 'Machine') }
  if (-not [string]::IsNullOrWhiteSpace($configuredKey)) { $env:openai_api_key = $configuredKey }
  $configuredKey = $null
}
$port = if ($env:ENGLISH_PORT) { [int]$env:ENGLISH_PORT } else { 3210 }
$localUrl = "http://127.0.0.1:$port"
$alreadyRunning = $false
try { $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 2; $alreadyRunning = $health.app -eq 'EnglishLehrer' } catch { }
if ($alreadyRunning -and $Restart) {
  $state = Invoke-RestMethod -Uri "$localUrl/api/home" -TimeoutSec 3
  if (@($state.history | Where-Object status -eq 'active').Count -gt 0) { throw 'Please finish the active lesson before restarting.' }
  $preparationBusy = $false
  try { $preparationBusy = (Invoke-RestMethod -Uri "$localUrl/api/preparation" -TimeoutSec 3).busy } catch { }
  if ($preparationBusy) { throw 'Please wait for the preparation chat to finish before restarting.' }
  $listener = Get-NetTCPConnection -LocalPort $port -State Listen
  $serviceProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  $expectedServer = Join-Path $PSScriptRoot 'server/index.js'
  if (-not $serviceProcess.CommandLine.Contains($expectedServer)) { throw 'The running service belongs to another folder. Close it there first.' }
  Stop-Process -Id $serviceProcess.ProcessId
  $alreadyRunning = $false
}
if (-not $alreadyRunning) {
  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules'))) {
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your internet connection.' }
  }
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'The application could not be built.' }
  New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'data') -Force | Out-Null
  $nodePath = (Get-Command node).Source
  $serverPath = Join-Path $PSScriptRoot 'server/index.js'
  Start-Process -FilePath $nodePath -ArgumentList @("`"$serverPath`"") -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/server.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/server-error.log') | Out-Null
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    try { $health = Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 1; if ($health.app -eq 'EnglishLehrer') { $alreadyRunning = $true; break } } catch { }
  }
  if (-not $alreadyRunning) { throw 'The local service did not start. See data/server-error.log.' }
}
$chromeCandidates = @("$env:PROGRAMFILES/Google/Chrome/Application/chrome.exe", "${env:PROGRAMFILES(X86)}/Google/Chrome/Application/chrome.exe", "$env:LOCALAPPDATA/Google/Chrome/Application/chrome.exe")
$chromePath = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $NoBrowser) {
  if ($chromePath) { Start-Process -FilePath $chromePath -ArgumentList $localUrl -WindowStyle Normal }
  else { Start-Process $localUrl }
}
Write-Host "EnglishLehrer is ready: $localUrl"
