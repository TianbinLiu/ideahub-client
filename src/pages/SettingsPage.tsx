/**
 * @file SettingsPage.tsx - 用户统一设置页面
 * @category Page
 * @requires_auth yes
 * @i18n_module settings
 * @route /settings
 * 
 * 📖 [AI] 修改前必读: /.ai-instructions.md #新建页面必备功能清单
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 对应章节
 * 
 * 职责:
 * - 集中管理页面语言设置
 * - 集中管理站点组件开关和子设置入口
 * - 提供黑名单与资料编辑入口
 * - 提供删除账号等危险操作入口
 * 
 * 被使用于:
 * @used_in App.tsx - 设置页面路由
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { deleteAccount } from "../api";
import { useAuth } from "../authContext";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { humanizeError } from "../utils/humanizeError";

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const userId = user?._id;

  async function handleDeleteAccount() {
    if (!userId) return;

    setDeleting(true);
    try {
      await deleteAccount(userId);
      toast.success(t("profile.accountDeleted"));
      // 用 logout() 同时清 token 和全局 user，避免删号后 UI 仍显示已登录（与 ArenaProfilePage/MePage 一致）
      logout();
      setTimeout(() => {
        navigate("/", { replace: true });
      }, 1000);
    } catch (e: any) {
      toast.error(humanizeError(e));
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">{t("settings.title")}</h1>
        <p className="mt-2 text-gray-400">{t("settings.subtitle")}</p>
      </div>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{t("settings.languageTitle")}</h2>
          <p className="mt-1 text-sm text-gray-400">{t("settings.languageDescription")}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium text-gray-200">{t("settings.languageLabel")}</span>
          <LanguageSwitcher />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{t("settings.pagesTitle")}</h2>
          <p className="mt-1 text-sm text-gray-400">{t("settings.pagesDescription")}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            to="/workshop"
            className="rounded-xl border border-gray-700 px-4 py-3 text-sm font-semibold text-gray-100 hover:bg-gray-800"
          >
            {t("workshop.title")}
          </Link>
          <Link
            to="/blacklist"
            className="rounded-xl border border-red-700 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-900/20"
          >
            {t("settings.blacklistPageAction")}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-red-900/70 bg-red-950/20 p-5 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-red-200">{t("settings.dangerTitle")}</h2>
          <p className="mt-1 text-sm text-red-200/80">{t("settings.deleteAccountDescription")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="rounded-xl border border-red-700 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-900/20"
        >
          {t("profile.deleteAccount")}
        </button>
      </section>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-red-700 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-lg font-semibold text-white">{t("profile.deleteAccountConfirm")}</h3>

            <div className="mb-6 rounded-lg border border-red-800 bg-red-900/20 p-4">
              <p className="text-sm text-red-300">{t("profile.deleteAccountWarning")}</p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-lg border border-gray-600 px-4 py-2 text-gray-200 hover:bg-gray-800 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-700"
              >
                {deleting ? t("common.loading") : t("profile.deleteAccountButton")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}