$ErrorActionPreference = 'SilentlyContinue'

$root = 'C:\Users\admin\Documents\Hermes-Pixel-Office'
$python = 'C:\Users\admin\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe'
$port = 8777
$auth = Join-Path $root 'auth.local.ps1'

if (Test-Path -LiteralPath $auth) {
  . $auth
}

$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $python
  $psi.Arguments = 'server.py'
  $psi.WorkingDirectory = $root
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $psi.UseShellExecute = $false
  if ($env:HERMES_WEB_USER) { $psi.Environment['HERMES_WEB_USER'] = $env:HERMES_WEB_USER }
  if ($env:HERMES_WEB_PASSWORD) { $psi.Environment['HERMES_WEB_PASSWORD'] = $env:HERMES_WEB_PASSWORD }
  if ($env:HERMES_WEB_SECRET) { $psi.Environment['HERMES_WEB_SECRET'] = $env:HERMES_WEB_SECRET }
  [System.Diagnostics.Process]::Start($psi) | Out-Null
}
