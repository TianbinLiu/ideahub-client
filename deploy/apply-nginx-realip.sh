#!/usr/bin/env bash
# 恢复 Cloudflare 背后的真实客户端 IP。需要 sudo：
#     sudo bash /tmp/apply-nginx-realip.sh
#
# 幂等：重复运行只刷新 IP 段。
# 安全：★不修改任何现有配置文件★ —— 只往 /etc/nginx/conf.d/ 放一个新文件，
#       它被 nginx.conf 里既有的 `include /etc/nginx/conf.d/*.conf;` 自动加载。
#       回退 = 删掉那一个文件。nginx -t 不通过则删除新文件并中止，绝不 reload 坏配置。
#
# ── 解决什么问题 ────────────────────────────────────────────────
# 接入 Cloudflare 代理后，nginx 看到的 $remote_addr 是 Cloudflare 边缘 IP，
# 不是真实用户。两个后果：
#   1. 访问日志里全是 Cloudflare 的 IP，出问题时查不到是谁。
#   2. nginx 把这个 IP 追加进 X-Forwarded-For，Node 侧 trust proxy=1 于是取到
#      边缘 IP —— 同一边缘后的【所有用户共用一个限流桶】，登录限流从
#      「按用户」退化成「按全站」。（已实测复现。）
# real_ip 模块把 $remote_addr 换回真实 IP，两个问题一起解决。
#
# ── 为什么放 http 层而不是逐个 server 块 ────────────────────────
# real_ip 指令在 http 上下文合法，一处生效于全部 server 块（含以后新增的）。
# 逐个 server 块插入还会遇到锚点歧义：本站 `server_name api.ideahubs.org;`
# 在 80 端口跳转块和 443 块各出现一次，按名字锚定会改错地方。
#
# ── 为什么 IP 段要实时拉取 ──────────────────────────────────────
# Cloudflare 的边缘 IP 段会变。硬编码一份过期的段，nginx 会把真实的 Cloudflare
# 请求当成不可信来源、跳过 real_ip 替换 —— 日志和限流悄悄退回错误状态，
# 且不会有任何报错。属于静默失效，所以每次运行都从官方端点重新拉。
set -euo pipefail

CONF=/etc/nginx/conf.d/cloudflare-realip.conf
TMP_NEW=$(mktemp)
trap 'rm -f "$TMP_NEW"' EXIT

command -v nginx >/dev/null || { echo "❌ 找不到 nginx"; exit 1; }
nginx -V 2>&1 | grep -q -- "--with-http_realip_module" \
    || { echo "❌ 本 nginx 未编译 realip 模块，无法继续"; exit 1; }

# ── 1. 拉取官方 IP 段 ──────────────────────────────────────────
echo "拉取 Cloudflare 官方 IP 段…"
V4=$(curl -fsS https://www.cloudflare.com/ips-v4 --max-time 20) \
    || { echo "❌ 拉取 ips-v4 失败，中止（宁可不改，也不用可能过期的旧值）"; exit 1; }
V6=$(curl -fsS https://www.cloudflare.com/ips-v6 --max-time 20) \
    || { echo "❌ 拉取 ips-v6 失败，中止"; exit 1; }

N4=$(grep -c . <<<"$V4"); N6=$(grep -c . <<<"$V6")
# 合理性校验：正常约 15 个 v4 / 7 个 v6。数量异常多半是拉到了错误页而非列表，
# 写进配置会造成「看似成功、实则全部不生效」。
if (( N4 < 10 || N6 < 4 )); then
    echo "❌ 段数异常（v4=$N4 v6=$N6），疑似不是有效列表，中止"
    exit 1
fi
# 逐行校验形如 CIDR，防止把 HTML 之类的东西写进 nginx 配置
while read -r cidr; do
    [[ -z "$cidr" ]] && continue
    [[ "$cidr" =~ ^[0-9a-fA-F:.]+/[0-9]{1,3}$ ]] || { echo "❌ 非法条目: $cidr，中止"; exit 1; }
done <<<"$V4
$V6"
echo "✅ 取得 $N4 个 IPv4 段、$N6 个 IPv6 段"

# ── 2. 生成配置 ───────────────────────────────────────────────
{
    echo "# 由 apply-nginx-realip.sh 生成于 $(date -Is)"
    echo "# 数据源：https://www.cloudflare.com/ips-v4 与 ips-v6"
    echo "# ★ 不要手工编辑：Cloudflare 的 IP 段会变，重跑该脚本即可刷新。"
    echo "# 本文件由 nginx.conf 的 include /etc/nginx/conf.d/*.conf 自动加载。"
    echo
    while read -r c; do [[ -n "$c" ]] && echo "set_real_ip_from $c;"; done <<<"$V4"
    while read -r c; do [[ -n "$c" ]] && echo "set_real_ip_from $c;"; done <<<"$V6"
    echo
    echo "# 用 Cloudflare 专有头取真实 IP。相比 X-Forwarded-For 的好处：值恒为单个"
    echo "# 真实客户端 IP，不受链路跳数影响；且 Cloudflare 会覆盖客户端自带的同名头"
    echo "# （实测：伪造该头的请求被 Cloudflare 直接 403），故来自上述网段的请求可信。"
    echo "real_ip_header CF-Connecting-IP;"
    echo "# CF-Connecting-IP 只有单值，无需递归解析；显式关闭更明确。"
    echo "real_ip_recursive off;"
} > "$TMP_NEW"

HAD_OLD=0
if [[ -f "$CONF" ]]; then
    HAD_OLD=1
    cp -a "$CONF" "${CONF}.bak.$(date +%F-%H%M%S)"
    echo "ℹ️  已存在配置，先备份再刷新（幂等）"
fi

install -m 0644 "$TMP_NEW" "$CONF"
echo "✅ 已写入 $CONF"

# ── 3. 校验并生效 ─────────────────────────────────────────────
if nginx -t; then
    systemctl reload nginx
    echo "✅ nginx 已 reload"
else
    if (( HAD_OLD )); then
        LATEST=$(ls -1t "${CONF}".bak.* 2>/dev/null | head -1)
        [[ -n "$LATEST" ]] && cp -a "$LATEST" "$CONF"
        echo "❌ nginx -t 未通过，已还原上一版配置，未 reload。"
    else
        rm -f "$CONF"
        echo "❌ nginx -t 未通过，已删除新增配置，未 reload。站点不受影响。"
    fi
    exit 1
fi

# ── 4. 验证 ───────────────────────────────────────────────────
# reload 是异步的，旧 worker 还会服务一会儿，所以要重试后再判断。
echo
echo "=== 验证：访问日志里应记录【真实客户端 IP】而非 Cloudflare 边缘 IP ==="
LOG=/var/log/nginx/access.log
CF_PREFIX='^(104\.1[6-9]\.|104\.2[0-7]\.|172\.6[4-9]\.|172\.7[0-1]\.|162\.15[89]\.|141\.101\.|108\.162\.|188\.114\.|190\.93\.|197\.234\.|198\.41\.|173\.245\.|103\.2[12]\.|103\.31\.|131\.0\.7)'
FOUND=""
for attempt in 1 2 3 4 5; do
    BEFORE=$(wc -l < "$LOG" 2>/dev/null || echo 0)
    curl -sI https://ideahubs.org --max-time 10 >/dev/null 2>&1 || true
    sleep 2
    FOUND=$(tail -n "+$((BEFORE+1))" "$LOG" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')
    [[ -n "${FOUND// }" ]] && break
done

if [[ -z "${FOUND// }" ]]; then
    echo "（未抓到新日志行，请手动确认：sudo tail -5 $LOG）"
elif grep -qE "$CF_PREFIX" <<<"$FOUND"; then
    echo "⚠️  日志里仍是 Cloudflare 段的 IP（$FOUND）"
    echo "    可能原因：nginx.conf 未 include conf.d/，或该请求未经 Cloudflare。"
    echo "    检查：sudo nginx -T | grep -c set_real_ip_from   （应 > 0）"
else
    echo "✅ 记录到的客户端 IP: $FOUND —— real_ip 已生效"
fi

echo
echo "回退：sudo rm $CONF && sudo nginx -t && sudo systemctl reload nginx"
echo "刷新 IP 段：重新运行本脚本（幂等）"
