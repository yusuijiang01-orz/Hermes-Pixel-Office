# Hermes Pixel Office Remote Access

This route keeps Hermes Pixel Office running on the home Windows PC, and uses the VPS plus `pix.lovenom.eu.org` as the public HTTPS entrance.

Final path:

```text
Phone -> https://pix.lovenom.eu.org -> VPS Nginx -> frp -> Home PC 127.0.0.1:8777
```

## 1. Current DNS

`pix.lovenom.eu.org` already resolves to:

```text
77.90.40.68
```

## 2. VPS Setup

Upload this project folder to the VPS, then run:

```bash
cd Hermes-Pixel-Office
sudo bash deploy/install-vps-frp.sh \
  --domain pix.lovenom.eu.org \
  --admin-user admin \
  --admin-pass 'change-this-password' \
  --email you@example.com
```

If you do not want to provide email:

```bash
sudo bash deploy/install-vps-frp.sh \
  --domain pix.lovenom.eu.org \
  --admin-user admin \
  --admin-pass 'change-this-password'
```

The script prints an `frp token`. Keep it. The home PC script needs it.

## 3. Home Windows PC Setup

Run PowerShell as Administrator from this project folder:

```powershell
powershell -ExecutionPolicy Bypass -File deploy/install-home-frpc.ps1 `
  -ServerAddr pix.lovenom.eu.org `
  -ServerPort 7000 `
  -Token "paste-the-frp-token-here" `
  -LocalPort 8777 `
  -RemotePort 18777
```

This creates a Windows startup task:

```text
Hermes Pixel Office frpc
```

## 4. Visit

Open on phone:

```text
https://pix.lovenom.eu.org/
```

The browser will ask for the administrator username and password configured in the VPS script.

## 5. Requirements

- Home PC must be powered on.
- Hermes Pixel Office must be running locally on `127.0.0.1:8777`.
- The Windows `frpc` scheduled task must be running.
- VPS ports `80`, `443`, and `7000` must be open.

## 6. Useful Checks

On the home PC:

```powershell
Test-NetConnection pix.lovenom.eu.org -Port 7000
Get-ScheduledTask -TaskName "Hermes Pixel Office frpc"
```

On the VPS:

```bash
sudo systemctl status hermes-pixel-frp
sudo nginx -t
sudo journalctl -u hermes-pixel-frp -f
```
