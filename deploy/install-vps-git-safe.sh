#!/usr/bin/env bash
set -euo pipefail

APP_NAME="hermes-pixel-office"
APP_DIR="/opt/hermes-pixel-office"
SERVICE_USER="hermes"
PORT="8777"
BIND_HOST="127.0.0.1"
DOMAIN=""
ADMIN_USER="admin"
ADMIN_PASS=""
HERMES_EXE="/usr/local/bin/hermes"
HERMES_HOME="/var/lib/hermes-pixel-office/.hermes"
FAST_STATE_ONLY="1"
EMAIL=""
NO_SSL="0"
REPO_URL=""
BRANCH="main"
SKIP_NGINX_INSTALL="0"

usage() {
  cat <<'EOF'
Hermes Pixel Office safe VPS installer

This variant is designed to avoid disturbing existing panels such as s-ui:
- does not remove /etc/nginx/sites-enabled/default
- does not overwrite unrelated nginx sites
- can deploy directly from a Git repository

Example:

  sudo bash deploy/install-vps-git-safe.sh \
    --repo https://github.com/yusuijiang01-orz/Hermes-Pixel-Office.git \
    --branch main \
    --domain pix.lovenom.eu.org \
    --port 8777 \
    --admin-user admin \
    --admin-pass 'change-me-now' \
    --hermes-exe /usr/local/bin/hermes \
    --email you@example.com

Options:
  --repo              Git repository URL to clone/pull.
  --branch            Git branch to deploy. Default: main.
  --domain            Domain for public access. Strongly recommended.
  --port              Internal app port. Default: 8777.
  --bind-host         Internal bind host. Default: 127.0.0.1.
  --admin-user        Nginx Basic Auth username. Default: admin.
  --admin-pass        Nginx Basic Auth password. Prompted if omitted.
  --hermes-exe        Hermes CLI path on VPS. Default: /usr/local/bin/hermes.
  --hermes-home       Hermes data directory. Default: /var/lib/hermes-pixel-office/.hermes.
  --fast-state-only   Set HERMES_FAST_STATE_ONLY (1/0). Default: 1 for low-memory VPS safety.
  --email             Email for Let's Encrypt when --domain is set.
  --app-dir           Install directory. Default: /opt/hermes-pixel-office.
  --skip-nginx-install
                      Do not apt install nginx/certbot packages.
  --no-ssl            Skip Let's Encrypt even when --domain is provided.
  -h, --help          Show help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_URL="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --bind-host) BIND_HOST="${2:-}"; shift 2 ;;
    --admin-user) ADMIN_USER="${2:-}"; shift 2 ;;
    --admin-pass) ADMIN_PASS="${2:-}"; shift 2 ;;
    --hermes-exe) HERMES_EXE="${2:-}"; shift 2 ;;
    --hermes-home) HERMES_HOME="${2:-}"; shift 2 ;;
    --fast-state-only) FAST_STATE_ONLY="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --app-dir) APP_DIR="${2:-}"; shift 2 ;;
    --skip-nginx-install) SKIP_NGINX_INSTALL="1"; shift ;;
    --no-ssl) NO_SSL="1"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root." >&2
  exit 1
fi

if [[ -z "${REPO_URL}" ]]; then
  echo "--repo is required." >&2
  exit 1
fi

if ! [[ "${PORT}" =~ ^[0-9]+$ ]] || [[ "${PORT}" -lt 1 || "${PORT}" -gt 65535 ]]; then
  echo "--port must be a valid TCP port." >&2
  exit 1
fi

if [[ -z "${ADMIN_USER}" ]]; then
  echo "--admin-user cannot be empty." >&2
  exit 1
fi

if [[ -z "${ADMIN_PASS}" ]]; then
  read -r -s -p "Admin password: " ADMIN_PASS
  echo
  if [[ -z "${ADMIN_PASS}" ]]; then
    echo "Admin password cannot be empty." >&2
    exit 1
  fi
fi

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3 git apache2-utils
if [[ "${SKIP_NGINX_INSTALL}" != "1" ]]; then
  apt-get install -y nginx
  if [[ -n "${DOMAIN}" && "${NO_SSL}" != "1" ]]; then
    apt-get install -y certbot python3-certbot-nginx
  fi
fi

echo "==> Creating service user"
if ! id "${SERVICE_USER}" >/dev/null 2>&1; then
  adduser --system --group --home "${APP_DIR}" "${SERVICE_USER}"
fi

echo "==> Preparing app directory"
mkdir -p "${APP_DIR}"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  rm -rf "${APP_DIR:?}/"*
  git clone --branch "${BRANCH}" --depth 1 "${REPO_URL}" "${APP_DIR}"
else
  git -C "${APP_DIR}" fetch origin "${BRANCH}"
  git -C "${APP_DIR}" checkout "${BRANCH}"
  git -C "${APP_DIR}" reset --hard "origin/${BRANCH}"
fi
mkdir -p "${APP_DIR}/uploads/chat"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"

echo "==> Preparing Hermes home"
mkdir -p "${HERMES_HOME}"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${HERMES_HOME}"

echo "==> Writing environment file"
cat >"/etc/${APP_NAME}.env" <<EOF
PORT=${PORT}
HERMES_EXE=${HERMES_EXE}
HERMES_HOME=${HERMES_HOME}
HERMES_FAST_STATE_ONLY=${FAST_STATE_ONLY}
EOF
chmod 640 "/etc/${APP_NAME}.env"
chown root:"${SERVICE_USER}" "/etc/${APP_NAME}.env"

echo "==> Writing systemd service"
cat >"/etc/systemd/system/${APP_NAME}.service" <<EOF
[Unit]
Description=Hermes Pixel Office
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=/etc/${APP_NAME}.env
Environment=HOME=${HERMES_HOME%/.hermes}
ExecStart=/usr/bin/python3 ${APP_DIR}/server.py
Restart=always
RestartSec=3
User=${SERVICE_USER}
Group=${SERVICE_USER}

[Install]
WantedBy=multi-user.target
EOF

if command -v nginx >/dev/null 2>&1; then
  echo "==> Configuring Nginx site"
  htpasswd -bc "/etc/nginx/${APP_NAME}.htpasswd" "${ADMIN_USER}" "${ADMIN_PASS}" >/dev/null
  chmod 640 "/etc/nginx/${APP_NAME}.htpasswd"
  chown root:www-data "/etc/nginx/${APP_NAME}.htpasswd"

  SERVER_NAME="_"
  if [[ -n "${DOMAIN}" ]]; then
    SERVER_NAME="${DOMAIN}"
  fi

  cat >"/etc/nginx/sites-available/${APP_NAME}" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    client_max_body_size 20m;

    auth_basic "Hermes Pixel Office";
    auth_basic_user_file /etc/nginx/${APP_NAME}.htpasswd;

    location / {
        proxy_pass http://${BIND_HOST}:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/events {
        proxy_pass http://${BIND_HOST}:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}
EOF

  ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/${APP_NAME}"
  nginx -t
fi

echo "==> Starting service"
systemctl daemon-reload
systemctl enable --now "${APP_NAME}"
systemctl restart "${APP_NAME}"

if command -v nginx >/dev/null 2>&1; then
  systemctl reload nginx
fi

if command -v certbot >/dev/null 2>&1 && [[ -n "${DOMAIN}" && "${NO_SSL}" != "1" ]]; then
  echo "==> Requesting Let's Encrypt certificate for ${DOMAIN}"
  if [[ -n "${EMAIL}" ]]; then
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" --redirect
  else
    certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --redirect
  fi
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow 'Nginx Full' >/dev/null || true
fi

echo
echo "==> Deployment complete"
if [[ -n "${DOMAIN}" && "${NO_SSL}" != "1" ]]; then
  echo "URL: https://${DOMAIN}/"
elif [[ -n "${DOMAIN}" ]]; then
  echo "URL: http://${DOMAIN}/"
else
  PUBLIC_IP="$(hostname -I | awk '{print $1}')"
  echo "URL: http://${PUBLIC_IP}/"
fi
echo "Admin user: ${ADMIN_USER}"
echo
echo "Safe-mode notes:"
echo "  - default nginx site was left untouched"
echo "  - unrelated nginx vhosts were left untouched"
echo "  - app code is pulled from ${REPO_URL} (${BRANCH})"
