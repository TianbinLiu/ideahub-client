/**
 * DocsAdminPage - 项目架构文档查看页面
 * 
 * 📖 开发规范：修改此文件时请同步更新 PROJECT_STRUCTURE.md
 * 🌍 国际化：所有用户可见文本使用 t() 函数
 * 🔒 权限：仅管理员可访问
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api";
import { GITHUB_DOCS_URL, GITHUB_REPO_URL } from "../config";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function DocsAdminPage() {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const githubDocsUrl =
    GITHUB_DOCS_URL ||
    (GITHUB_REPO_URL
      ? `${GITHUB_REPO_URL.replace(/\/$/, "")}/blob/main/PROJECT_STRUCTURE.md`
      : "");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await apiFetch<{ content: string }>("/api/admin/docs");
        setContent(res.content);
      } catch (e: any) {
        toast.error(humanizeError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4 pb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.projectDocs')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('admin.projectDocsDescription')}</p>
        </div>
        {githubDocsUrl && (
          <a
            href={githubDocsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            {t('admin.viewOnGitHub')}
          </a>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">{t('common.loading')}</div>
        </div>
      )}

      {!loading && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 prose prose-invert prose-sm max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // 自定义样式以适配深色主题
              h1: ({ node, ...props }) => (
                <h1 className="text-3xl font-bold text-white mt-8 mb-4 pb-2 border-b border-gray-700" {...props} />
              ),
              h2: ({ node, ...props }) => (
                <h2 className="text-2xl font-semibold text-white mt-6 mb-3" {...props} />
              ),
              h3: ({ node, ...props }) => (
                <h3 className="text-xl font-semibold text-white mt-4 mb-2" {...props} />
              ),
              h4: ({ node, ...props }) => (
                <h4 className="text-lg font-semibold text-gray-200 mt-3 mb-2" {...props} />
              ),
              p: ({ node, ...props }) => (
                <p className="text-gray-300 mb-3 leading-relaxed" {...props} />
              ),
              ul: ({ node, ...props }) => (
                <ul className="list-disc list-inside text-gray-300 mb-3 space-y-1" {...props} />
              ),
              ol: ({ node, ...props }) => (
                <ol className="list-decimal list-inside text-gray-300 mb-3 space-y-1" {...props} />
              ),
              li: ({ node, ...props }) => (
                <li className="text-gray-300" {...props} />
              ),
              code: ({ node, inline, ...props }: any) =>
                inline ? (
                  <code className="bg-gray-800 text-blue-300 px-1.5 py-0.5 rounded text-sm" {...props} />
                ) : (
                  <code className="block bg-gray-950 text-gray-200 p-3 rounded-lg overflow-x-auto text-sm" {...props} />
                ),
              pre: ({ node, ...props }) => (
                <pre className="bg-gray-950 rounded-lg overflow-x-auto mb-3" {...props} />
              ),
              blockquote: ({ node, ...props }) => (
                <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-400 mb-3" {...props} />
              ),
              a: ({ node, ...props }) => (
                <a className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer" {...props} />
              ),
              table: ({ node, ...props }) => (
                <div className="overflow-x-auto mb-3">
                  <table className="min-w-full border border-gray-700" {...props} />
                </div>
              ),
              thead: ({ node, ...props }) => (
                <thead className="bg-gray-800" {...props} />
              ),
              th: ({ node, ...props }) => (
                <th className="px-4 py-2 text-left text-gray-200 font-semibold border border-gray-700" {...props} />
              ),
              td: ({ node, ...props }) => (
                <td className="px-4 py-2 text-gray-300 border border-gray-700" {...props} />
              ),
              hr: ({ node, ...props }) => (
                <hr className="border-gray-700 my-6" {...props} />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
