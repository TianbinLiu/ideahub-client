#!/usr/bin/env bash
# 把安全响应头接进 nginx 站点配置。需要 sudo 运行：
#     sudo bash /tmp/apply-nginx-headers.sh
#
# 幂等：重复运行不会重复插入。
# 安全：改动前自动备份；nginx -t 校验不通过则自动回滚并拒绝 reload。
#
# ★ 为什么要插【三处】而不是只在 server 块加一次：
#   nginx 的 add_header 不是叠加继承——只要子 location 里出现任何 add_header，
#   从父块继承来的全部 add_header 会被【整体丢弃】。本站的
#   `location = /index.html` 与 `location /assets/` 都已有 Cache-Control 的
#   add_header，若只在 server 层加，恰恰是首页和所有静态资源没有安全头。
set -euo pipefail

SITE=/etc/nginx/sites-available/ideahub
SNIPPET_SRC=/tmp/ideahub-security-headers.conf
SNIPPET_DST=/etc/nginx/snippets/ideahub-security-headers.conf
INCLUDE_LINE='    include /etc/nginx/snippets/ideahub-security-headers.conf;'

[[ -f "$SNIPPET_SRC" ]] || { echo "❌ 找不到 $SNIPPET_SRC，请先上传"; exit 1; }
[[ -f "$SITE" ]] || { echo "❌ 找不到 $SITE"; exit 1; }

BACKUP="${SITE}.bak.$(date +%F-%H%M%S)"
cp -a "$SITE" "$BACKUP"
echo "✅ 已备份站点配置 → $BACKUP"

mkdir -p /etc/nginx/snippets
install -m 0644 "$SNIPPET_SRC" "$SNIPPET_DST"
echo "✅ 已放置 snippet → $SNIPPET_DST"

python3 - "$SITE" <<'PY'
import io, re, sys

path = sys.argv[1]
inc = "    include /etc/nginx/snippets/ideahub-security-headers.conf;"
src = io.open(path, encoding="utf-8").read()

if inc.strip() in src:
    print("ℹ️  已包含 include，跳过插入（幂等）")
    raise SystemExit(0)

# 三个插入锚点：server 块本体 + 两个自带 add_header 的 location
anchors = [
    ("    index index.html;",        "server 块"),
    ("    location = /index.html {", "location = /index.html"),
    ("    location /assets/ {",      "location /assets/"),
]

lines = src.split("\n")
for anchor, label in anchors:
    hits = [i for i, l in enumerate(lines) if l.rstrip() == anchor.rstrip()]
    if len(hits) != 1:
        raise SystemExit(f"❌ 锚点 {label!r} 匹配到 {len(hits)} 处（期望恰好 1 处），中止以免改错位置")

# 从后往前插，避免前面的插入改变后面的行号
for anchor, label in reversed(anchors):
    i = next(i for i, l in enumerate(lines) if l.rstrip() == anchor.rstrip())
    lines.insert(i + 1, inc)
    print(f"✅ 已在 {label} 之后插入 include")

io.open(path, "w", encoding="utf-8", newline="").write("\n".join(lines))
PY

if nginx -t; then
    systemctl reload nginx
    echo "✅ nginx 已 reload"
else
    cp -a "$BACKUP" "$SITE"
    echo "❌ nginx -t 未通过，已回滚到 $BACKUP，未 reload。站点不受影响。"
    exit 1
fi

echo
echo "=== 验证（应能看到 CSP / HSTS / X-Frame-Options）==="
curl -sI https://ideahubs.org | grep -iE "content-security-policy|strict-transport|x-frame-options|x-content-type|referrer-policy|permissions-policy" || echo "⚠️  未看到安全头，请检查"
echo
echo "回退方法：sudo cp $BACKUP $SITE && sudo nginx -t && sudo systemctl reload nginx"
