# Hermes Pixel Office 迁移到 `193.9.44.89`

目标：

- 把 Hermes Pixel Office 从“VPS 反代 + 家里 Windows + frp”改成“直接跑在 VPS 上”
- 不影响现有 `s-ui`
- 代码优先从 GitHub 拉取
- 域名 `pix.lovenom.eu.org` 后续指向 `193.9.44.89`

## 现阶段结论

当前仓库已补充一个更安全的部署脚本：

```bash
deploy/install-vps-git-safe.sh
```

它和旧脚本的差异：

- 不删除 `/etc/nginx/sites-enabled/default`
- 不删除其它 Nginx 站点
- 支持直接 `git clone / git pull`
- 仍然使用独立的 `hermes-pixel-office.service`

## 迁移前检查

先在 VPS 上确认下面这些信息，避免碰到 `s-ui`：

```bash
ss -ltnp
systemctl list-units --type=service --all | grep -Ei 's-ui|x-ui|nginx'
ls -la /etc/nginx/sites-enabled
ls -la /etc/nginx/conf.d
```

重点看：

- `80/443` 是否已经由 Nginx 占用
- `s-ui` 是不是也通过 Nginx 暴露
- `pix.lovenom.eu.org` 是否会和已有站点 `server_name` 冲突

## 推荐迁移顺序

1. 先确认 VPS 可以从外部连通 `22/80/443`
2. 把 `pix.lovenom.eu.org` 的 A 记录改到 `193.9.44.89`
3. 在 VPS 安装 Hermes CLI
4. 用 GitHub 脚本部署 Hermes Pixel Office
5. 验证 `systemd`、Nginx、登录页、`/api/state`
6. 再停掉老的 frp 路线

## 部署命令

在 VPS 上执行：

```bash
apt-get update
apt-get install -y git
git clone https://github.com/yusuijiang01-orz/Hermes-Pixel-Office.git
cd Hermes-Pixel-Office
chmod +x deploy/install-vps-git-safe.sh
sudo bash deploy/install-vps-git-safe.sh \
  --repo https://github.com/yusuijiang01-orz/Hermes-Pixel-Office.git \
  --branch main \
  --domain pix.lovenom.eu.org \
  --port 8777 \
  --admin-user admin \
  --admin-pass '先临时填一个，部署后立刻改' \
  --hermes-exe /usr/local/bin/hermes
```

如果暂时还没把域名切过去，可以先不申请证书：

```bash
sudo bash deploy/install-vps-git-safe.sh \
  --repo https://github.com/yusuijiang01-orz/Hermes-Pixel-Office.git \
  --branch main \
  --domain pix.lovenom.eu.org \
  --port 8777 \
  --admin-user admin \
  --admin-pass '先临时填一个，部署后立刻改' \
  --hermes-exe /usr/local/bin/hermes \
  --no-ssl
```

## 验证命令

```bash
systemctl status hermes-pixel-office --no-pager
journalctl -u hermes-pixel-office -n 80 --no-pager
nginx -t
curl -I http://127.0.0.1:8777/
curl -I http://pix.lovenom.eu.org/
```

## Hermes 数据迁移提醒

这个仓库只是 Web 外壳和服务端逻辑。要让 VPS 上的 Hermes 真正接手执行，还要迁移或重建：

- Hermes CLI 可执行文件
- Hermes profiles
- kanban board 数据
- 需要保留的长期状态文件

至少要确认 VPS 上的 `HERMES_EXE` 可用：

```bash
/usr/local/bin/hermes --help
```

如果你的 kanban 和 profile 还只在本地 Windows 机上，这一步不能跳过。

## 当前阻塞

从当前工作机到 `193.9.44.89` 的探测结果是：

- `22` 不通
- `80` 不通
- `443` 不通

所以这轮还不能直接远程 SSH 上去执行迁移。

## 下一步

等 VPS 可达后，优先执行：

```bash
ssh root@193.9.44.89
```

如果能连上，我下一轮就可以继续做：

- 检查 `s-ui` 占用关系
- 安装 Hermes Pixel Office
- 验证 `pix.lovenom.eu.org`
- 收尾旧的 frp 路线
