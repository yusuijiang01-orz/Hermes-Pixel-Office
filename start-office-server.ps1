$ErrorActionPreference = 'SilentlyContinue'

$root = 'C:\Users\admin\Documents\Hermes-Pixel-Office'
$python = 'C:\Users\admin\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe'
$port = 8777

$listening = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Start-Process -FilePath $python -ArgumentList 'server.py' -WorkingDirectory $root -WindowStyle Hidden
}
