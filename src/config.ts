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