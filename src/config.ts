/**
 * @file config.ts - TODO: 添加功能描述
 * @category Utility
 * 
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 相关章节
 * 
 * 职责:
 * - TODO: 描述主要职责
 * 
 */

const DEFAULT_GITHUB_REPO_URL = "https://github.com/TianbinLiu/ideahub-server";
const DEFAULT_GITHUB_DOCS_URL =
	"https://github.com/TianbinLiu/ideahub-server/blob/main/PROJECT_STRUCTURE.md";

const explicitApiBase = import.meta.env.VITE_API_BASE?.trim();

export const API_BASE = explicitApiBase || "";
export const GITHUB_REPO_URL =
	import.meta.env.VITE_GITHUB_REPO_URL || DEFAULT_GITHUB_REPO_URL;
export const GITHUB_DOCS_URL =
	import.meta.env.VITE_GITHUB_DOCS_URL || DEFAULT_GITHUB_DOCS_URL;

/**
 * 卢本伟广场浏览器插件的应用商店地址（VITE_EXT_STORE_URL）。
 *
 * ★没有默认值，也【不许】编个默认值：插件还没上架，编一个就是给用户一条死链。
 *   未配置 → "" → 门禁里「去商店安装」按钮置灰并说明原因（见 ExtensionGateModal）。
 * ★只放行 http/https：这个值来自构建期环境变量，正常情况可信，但它最终会喂给
 *   window.open()，挡一道就不会因为配错（如 javascript:）变成脚本执行点。
 */
function readExtStoreUrl(): string {
	const raw = import.meta.env.VITE_EXT_STORE_URL;
	if (typeof raw !== "string") return "";
	const trimmed = raw.trim();
	if (!trimmed) return "";
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			if (import.meta.env.DEV)
				console.warn(
					`[config] VITE_EXT_STORE_URL 协议不是 http/https，已忽略：${parsed.protocol}`
				);
			return "";
		}
		return parsed.toString();
	} catch (e) {
		if (import.meta.env.DEV)
			console.warn("[config] VITE_EXT_STORE_URL 不是合法 URL，已忽略：", e);
		return "";
	}
}

/** 插件商店地址；"" = 未配置（插件尚未上架） */
export const EXT_STORE_URL = readExtStoreUrl();