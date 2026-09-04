/**
 * @file voiceTemplates.ts - 声音市场模板的公共小件：作者名 / 错误文案 / 模板名缓存 hook / 试听句子
 * @category Utility
 *
 * 市场列表、模板详情、模板编辑器、首页「声音」面板、VoiceSettingsFields 的「来自模板」chip 都要这几样，
 * 各写一份迟早漂移（Live2D 市场三个页面就各抄了一份 authorName）。
 *
 * ★ 模板名缓存：VoiceSummary / 模板 chip 手上只有 templateId，要显示「来自模板：xx」得查一次 GET /api/voice-templates/:id。
 *   同一页可能有好几个摘要指向同一模板，模块级 Promise 缓存让它们共享一次请求；
 *   404 / 403（作者删了 / 转成私有）缓存为 null → 显示「模板已不存在」（用户的声音不受影响，配方是快照）；
 *   其它失败（网络抖动）不缓存，下次再试。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getVoiceTemplate, type VoiceSettings, type VoiceTemplate } from "../api";
import { humanizeError } from "../utils/humanizeError";
import { serverHumanMessage } from "./voiceMix";

export function templateAuthorName(author: VoiceTemplate["author"] | null | undefined): string {
  if (!author) return "-";
  return typeof author === "string" ? author : author.username || "-";
}

/**
 * 模板 → 可直接当 VoiceSettings 用的快照（voiceId ""、mix=配方、templateId=模板 id）。
 * 服务端已经拼好了 template.voice，优先用它；老服务端没给就按同一规则自己拼 —— 规则只写这一处。
 */
export function templateVoiceSnapshot(template: VoiceTemplate): VoiceSettings {
  if (template.voice && Array.isArray(template.voice.mix)) return { ...template.voice, templateId: template._id };
  return {
    voiceId: "",
    mix: template.recipe,
    templateId: template._id,
    rate: template.rate ?? null,
    pitch: template.pitch ?? null,
    instruct: template.instruct || "",
    expressive: template.expressive ?? true,
  };
}

/** 声音市场 / 混音相关请求的错误文案：服务端的中文人话优先（2.0 音色混不了之类），其余走 humanizeError */
export function voiceErrorMessage(err: unknown): string {
  return serverHumanMessage(err) ?? humanizeError(err);
}

const nameCache = new Map<string, Promise<string | null>>();

export function loadVoiceTemplateName(id: string): Promise<string | null> {
  const hit = nameCache.get(id);
  if (hit) return hit;
  const request = getVoiceTemplate(id)
    .then((res) => res.template.name)
    .catch((err: { status?: number } | null) => {
      // 被删 / 转私有是终态，记住它；别的失败下次再试
      if (err?.status !== 404 && err?.status !== 403) nameCache.delete(id);
      return null;
    });
  nameCache.set(id, request);
  return request;
}

/** 列表 / 选择器已经拿到整份模板时把名字灌进缓存：随后出现的 chip 不用再打一次接口 */
export function primeVoiceTemplateName(template: Pick<VoiceTemplate, "_id" | "name">) {
  nameCache.set(template._id, Promise.resolve(template.name));
}

/**
 * templateId → 名字。name=null 有两种含义，用 loading 区分：还在查 / 查过了但模板已不存在（或不可见）。
 * 没有 templateId 时 name=null、loading=false。
 */
export function useVoiceTemplateName(templateId: string | null | undefined) {
  const id = templateId || "";
  const [state, setState] = useState<{ id: string; name: string | null; loading: boolean }>({ id, name: null, loading: Boolean(id) });
  // id 换了就在渲染期重置（React 官方 "adjusting state while rendering" 写法，省一轮 effect 级联）
  if (state.id !== id) setState({ id, name: null, loading: Boolean(id) });

  useEffect(() => {
    if (!id) return;
    let alive = true;
    loadVoiceTemplateName(id).then((name) => {
      if (alive) setState({ id, name, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [id]);

  return { name: state.name, loading: state.loading };
}

/** 试听句子「你好，我是{数字人名}，这是我的新声音。」；name 缺省用 i18n 里的默认数字人名（小梦 / Mengmeng） */
export function usePreviewSentence(name?: string) {
  const { t } = useTranslation();
  return t("voiceMixer.previewText", { name: (name || "").trim() || t("companion.name") });
}
