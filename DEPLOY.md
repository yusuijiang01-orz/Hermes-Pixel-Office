# Hermes Pixel Office VPS Deployment

## One-Click Install

Upload the zipped project to your VPS, unzip it, then run:

```bash
cd Hermes-Pixel-Office
sudo bash deploy/install-vps.sh \
  --domain office.your-domain.com \
  --port 8777 \
  --admin-user admin \
  --admin-pass 'change-this-password' \
  --hermes-exe /usr/local/bin/hermes \
  --email you@example.com
```

If you do not have a domain ready yet:

```bash
sudo bash deploy/install-vps.sh \
  --port 8777 \
  --admin-user admin \
  --admin-pass 'change-this-password' \
  --no-ssl
```

This creates:

- `/opt/hermes-pixel-office`
- `systemd` service: `hermes-pixel-office`
- Nginx reverse proxy
- Nginx Basic Auth administrator login
- HTTPS certificate through Let's Encrypt when `--domain` is provided

Check logs:

```bash
sudo systemctl status hermes-pixel-office
sudo journalctl -u hermes-pixel-office -f
```

Important: install or migrate the Hermes CLI on the VPS first, then pass its path with `--hermes-exe`.

Recommended route:

1. Deploy this project as a HTTPS web service on the VPS.
2. Point a domain such as `office.your-domain.com` to the VPS.
3. Use the web app directly from phone/PC first.
4. Build a WeChat Mini Program wrapper only after the web service is stable.

## Requirements

- Ubuntu 22.04/24.04 VPS.
- Domain A record pointing to the VPS IP.
- Python 3.
- Hermes CLI installed on the VPS.
- The Hermes kanban/agent data migrated from the desktop machine or recreated on the VPS.
- Nginx + Let's Encrypt certificate.

## Install

```bash
sudo adduser --system --group --home /opt/hermes-pixel-office hermes
sudo mkdir -p /opt/hermes-pixel-office
sudo chown -R hermes:hermes /opt/hermes-pixel-office
```

Upload the project files into `/opt/hermes-pixel-office`.

Install or copy the Hermes CLI and update:

```ini
Environment=HERMES_EXE=/usr/local/bin/hermes
```

in `deploy/hermes-pixel-office.service` if needed.

## Service

```bash
sudo cp deploy/hermes-pixel-office.service /etc/systemd/system/hermes-pixel-office.service
sudo systemctl daemon-reload
sudo systemctl enable --now hermes-pixel-office
sudo systemctl status hermes-pixel-office
```

## Nginx

Replace `your-domain.example` in `deploy/nginx.hermes-pixel-office.conf`.

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.hermes-pixel-office.conf /etc/nginx/sites-available/hermes-pixel-office
sudo ln -s /etc/nginx/sites-available/hermes-pixel-office /etc/nginx/sites-enabled/hermes-pixel-office
sudo nginx -t
sudo certbot --nginx -d office.your-domain.com
sudo systemctl reload nginx
```

## Security Notes

Do not expose port `8777` directly to the internet. Keep it bound behind Nginx and firewall it if possible.

Add authentication before long-term public use. This app controls real Hermes agents and project tasks.

## Mini Program Notes

For a WeChat Mini Program, configure the HTTPS domain as a legal request domain in the WeChat public platform. Mini Program production requests cannot use a raw IP address.

The web app can be reused as a `web-view` only if the domain is configured as a business domain and passes WeChat verification. A more native Mini Program would call `/api/state`, `/api/message`, and `/api/events` or a WebSocket endpoint.
