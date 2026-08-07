# 部署配置

## 站点是怎么发布的（先看这个）

前端**不在 Vercel 上**。发布链路是：

```
push 到 main
  → .github/workflows/deploy.yml 在 GitHub Actions 上构建
  → rsync --delete 到 ECS 的 /var/www/ideahub-client-dist
  → 由 ECS 上的 nginx 提供服务（ideahubs.org）
```

所以：

- **`vercel.json` 对生产不生效**。它保留着只是为了 Vercel 预览部署（如果还在用）。
  改安全响应头 / 缓存策略要改 `nginx-security-headers.conf`，改完还要上传到服务器。
- nginx 的站点配置在服务器上的 `/etc/nginx/sites-available/ideahub`，**不在仓库里**，
  没有版本控制也没有备份。改动前先 `sudo cp` 一份。

## 应用安全响应头（推荐用脚本）

服务器上 `deploy` 用户没有免密 sudo，所以这一步必须由有 sudo 权限的人执行。
`apply-nginx-headers.sh` 已做成幂等 + 失败自动回滚：

```bash
# 本地上传（deploy 用户对 /tmp 有写权限）
scp deploy/nginx-security-headers.conf deploy/apply-nginx-headers.sh deploy@8.217.8.225:/tmp/

# 服务器上执行
ssh deploy@8.217.8.225
sudo bash /tmp/apply-nginx-headers.sh
```

脚本会：备份站点配置 → 放置 snippet → 在【三处】插入 include → `nginx -t` 校验
→ 通过才 reload → 用 curl 验证头已生效。**校验不通过会自动回滚且不 reload**，站点不受影响。

### 为什么是三处而不是一处

nginx 的 `add_header` 不是叠加继承：只要子 `location` 里出现任何 `add_header`，
从父块继承来的全部 `add_header` 会被**整体丢弃**。本站的 `location = /index.html`
与 `location /assets/` 都已有 `Cache-Control` 的 `add_header`——若只在 server 层加，
恰恰是首页和所有静态资源没有安全头。

### API 域名不需要改

`api.ideahubs.org` 由 Express 的 helmet 直接下发 CSP / HSTS / nosniff /
X-Frame-Options / Referrer-Policy，已实测确认，无需在 nginx 层重复。

## 手动应用（不用脚本时）

站点当前**没有任何安全响应头**（`curl -I https://ideahubs.org` 可自行确认）。
应用方式：

```bash
# 在本地，把配置传上去
scp deploy/nginx-security-headers.conf deploy@8.217.8.225:/tmp/

# SSH 上去
ssh deploy@8.217.8.225

# 先备份现有站点配置（它没有版本控制）
sudo cp /etc/nginx/sites-available/ideahub /etc/nginx/sites-available/ideahub.bak.$(date +%F)

# 放置 snippet
sudo mkdir -p /etc/nginx/snippets
sudo mv /tmp/nginx-security-headers.conf /etc/nginx/snippets/ideahub-security-headers.conf

# 编辑站点配置，在 ideahubs.org 的 server 块里加：
#     include /etc/nginx/snippets/ideahub-security-headers.conf;
sudo nano /etc/nginx/sites-available/ideahub

# 校验语法后再 reload（-t 不过就别 reload，否则站点会挂）
sudo nginx -t && sudo systemctl reload nginx
```

验证：

```bash
curl -I https://ideahubs.org
```

应当能看到 `Content-Security-Policy`、`Strict-Transport-Security`、
`X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff` 等。

### 回退

CSP 是最容易打挂页面的一项。若上线后发现前端功能异常：

```bash
# 最快的回退：把 include 那行注释掉
sudo nano /etc/nginx/sites-available/ideahub
sudo nginx -t && sudo systemctl reload nginx
```

然后在浏览器控制台看被拦截的是什么资源（会明确写出违反了哪条指令），
把对应的域名加进 `connect-src` / `script-src` 再重新上线。

也可以先用观察模式跑一段时间——把 snippet 里的 `Content-Security-Policy`
改成 `Content-Security-Policy-Report-Only`，只报告不拦截。

## 建议的缓存策略

带 hash 的静态资源可以长缓存，`index.html` 绝不能：否则发版后用户拿到的旧 HTML
会指向已经被 `rsync --delete` 删掉的 chunk，页面直接白屏。

在站点配置里加：

```nginx
location /assets/ {
    include /etc/nginx/snippets/ideahub-security-headers.conf;  # 见文件开头关于 add_header 继承的说明
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location = /index.html {
    include /etc/nginx/snippets/ideahub-security-headers.conf;
    add_header Cache-Control "public, max-age=0, must-revalidate" always;
}
```
