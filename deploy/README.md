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

## 恢复真实客户端 IP（Cloudflare real_ip）

接入 Cloudflare 代理后，nginx 看到的 `$remote_addr` 是 Cloudflare 边缘 IP。
两个后果：访问日志查不到真实用户；nginx 把该 IP 追加进 `X-Forwarded-For`，
Node 侧 `trust proxy=1` 于是取到边缘 IP，**同一边缘后的所有用户共用一个限流桶**
（登录限流从「按用户」退化成「按全站」，已实测复现）。

```bash
scp deploy/apply-nginx-realip.sh deploy@8.217.8.225:/tmp/
ssh deploy@8.217.8.225
sudo bash /tmp/apply-nginx-realip.sh
```

**这个脚本不修改任何现有配置文件** —— 只往 `/etc/nginx/conf.d/` 放一个新文件，
由 `nginx.conf` 里既有的 `include /etc/nginx/conf.d/*.conf;` 自动加载。
回退就是删掉那一个文件。

### 几个刻意的设计

- **IP 段实时拉取，不硬编码**：Cloudflare 的边缘网段会变。用过期的段，nginx 会把
  真实的 Cloudflare 请求当成不可信来源、跳过 real_ip 替换 —— 日志和限流悄悄退回
  错误状态且不报错。属于静默失效，所以每次运行都重新拉，拉取失败宁可中止不改。
- **拉取结果做合理性校验**：段数异常或格式不像 CIDR 就中止，避免把错误页写进配置。
- **放 http 层而不是逐个 server 块**：一处生效于全部 server（含以后新增的）。
  逐块插入还有锚点歧义 —— 本站 `server_name api.ideahubs.org;` 在 80 端口跳转块
  和 443 块各出现一次，按名字锚定会改错地方（初版脚本的断言正好拦下了这个）。
- **`real_ip_header CF-Connecting-IP`** 而非 `X-Forwarded-For`：前者恒为单个真实
  客户端 IP，不受链路跳数影响；且 Cloudflare 会覆盖客户端自带的同名头
  （实测伪造该头的请求被 Cloudflare 直接 403），故来自 CF 网段的请求可信。

### 维护

Cloudflare 更新网段后重跑本脚本即可（幂等）。可以考虑加进月度巡检。

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
