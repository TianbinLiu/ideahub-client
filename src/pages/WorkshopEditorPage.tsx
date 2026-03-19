import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  apiUploadImage,
  apiUploadMedia,
  createWorkshopTemplate,
  getWorkshopTagInsights,
  getWorkshopTemplateDetail,
  previewWorkshopAiEdit,
  updateWorkshopTemplate,
  type WorkshopLayout,
  type WorkshopTheme,
} from "../api";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { CURRENT_DEFAULT_TEMPLATE_VERSION } from "../utils/workshopVersion";
import { createDefaultWorkshopLayout } from "../utils/workshopLayout";
import WorkshopLayoutCanvas from "../components/WorkshopLayoutCanvas";

const DEFAULT_THEME: WorkshopTheme = {
  backgroundType: "none",
  backgroundUrl: "",
  accentColor: "#22d3ee",
  textColor: "#f3f4f6",
  cardRadius: 16,
  cardOpacity: 0.92,
  customCss: "",
  componentCss: { card: "", button: "", title: "" },
};

type ChatMessage = { role: "user" | "assistant"; content: string };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function updateLayoutItem(
  layout: WorkshopLayout,
  itemId: string,
  updater: (item: WorkshopLayout["pages"]["home"]["items"][number]) => WorkshopLayout["pages"]["home"]["items"][number]
) {
  return {
    ...layout,
    pages: {
      ...layout.pages,
      home: {
        ...layout.pages.home,
        items: layout.pages.home.items.map((item) => (item.id === itemId ? updater(item) : item)),
      },
    },
  };
}

export default function WorkshopEditorPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [shared, setShared] = useState(false);
  const [theme, setTheme] = useState<WorkshopTheme>(DEFAULT_THEME);
  const [layout, setLayout] = useState<WorkshopLayout>(createDefaultWorkshopLayout());
  const [templateVersion, setTemplateVersion] = useState(CURRENT_DEFAULT_TEMPLATE_VERSION);
  const [selectedId, setSelectedId] = useState<string | null>(layout.pages.home.items[0]?.id || null);
  const [changeSummary, setChangeSummary] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiModel, setAiModel] = useState("");
  const [aiTouched, setAiTouched] = useState(false);
  const [cssModalOpen, setCssModalOpen] = useState<"card" | "button" | "title" | null>(null);
  const [hotTags, setHotTags] = useState<string[]>([]);

  async function loadDetail() {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getWorkshopTemplateDetail(id);
      const tpl = res.template;
      setTitle(tpl.title || "");
      setSummary(tpl.summary || "");
      setPreviewImageUrl(tpl.previewImageUrl || "");
      setTagsText((tpl.tags || []).join(", "));
      setShared(!!tpl.shared);
      setTheme({ ...DEFAULT_THEME, ...(tpl.theme || {}) });
      setLayout(tpl.layout || createDefaultWorkshopLayout());
      setTemplateVersion(tpl.templateVersion || CURRENT_DEFAULT_TEMPLATE_VERSION);
      setSelectedId((tpl.layout?.pages?.home?.items || [])[0]?.id || null);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isEdit) loadDetail();
  }, [isEdit, id]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getWorkshopTagInsights(120);
        setHotTags((res.hotTags || []).slice(0, 8).map((item) => item.tag));
      } catch {
        // ignore non-critical tag helper failures
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedId) {
      const exists = layout.pages.home.items.some((item) => item.id === selectedId);
      if (!exists) setSelectedId(layout.pages.home.items[0]?.id || null);
    }
  }, [layout, selectedId]);

  const parsedTags = useMemo(
    () => tagsText.split(/[#,，,\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 12),
    [tagsText]
  );

  function appendTag(nextTag: string) {
    if (!nextTag.trim()) return;
    const normalized = nextTag.trim().toLowerCase();
    if (parsedTags.some((tag) => tag.toLowerCase() === normalized)) return;
    markManualChange();
    setTagsText((prev) => (prev.trim() ? `${prev.trim()}, ${nextTag}` : nextTag));
  }

  function removeTag(tagToRemove: string) {
    markManualChange();
    setTagsText(parsedTags.filter((tag) => tag !== tagToRemove).join(", "));
  }

  const selectedItem = useMemo(
    () => layout.pages.home.items.find((item) => item.id === selectedId) || null,
    [layout, selectedId]
  );

  const layoutJson = useMemo(() => JSON.stringify(layout, null, 2), [layout]);

  function markManualChange() {
    setAiTouched(false);
  }

  function setLayoutAndMark(nextLayout: WorkshopLayout) {
    markManualChange();
    setLayout(nextLayout);
  }

  function updateSelectedItem(field: "x" | "y" | "w" | "h", value: number) {
    if (!selectedId) return;
    setLayoutAndMark(
      updateLayoutItem(layout, selectedId, (item) => {
        if (field === "w") return { ...item, w: clamp(value, 8, 96) };
        if (field === "h") return { ...item, h: clamp(value, 6, 80) };
        if (field === "x") return { ...item, x: clamp(value, 0, 100 - item.w) };
        return { ...item, y: clamp(value, 0, 100 - item.h) };
      })
    );
  }

  async function handlePreviewUpload(file: File | null) {
    if (!file) return;
    try {
      const res = await apiUploadImage(file, "idea");
      setPreviewImageUrl(res.imageUrl);
      markManualChange();
      toast.success(t("workshop.uploaded"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleBackgroundUpload(file: File | null) {
    if (!file) return;
    try {
      const res = await apiUploadMedia(file);
      setTheme((prev) => ({
        ...prev,
        backgroundType: res.resourceType === "video" ? "video" : "image",
        backgroundUrl: res.mediaUrl,
      }));
      markManualChange();
      toast.success(t("workshop.uploaded"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleApplyAi() {
    if (!aiPrompt.trim()) {
      toast.error(t("workshop.aiInstructionPlaceholder"));
      return;
    }

    setAiBusy(true);
    try {
      const nextHistory = [...aiMessages, { role: "user" as const, content: aiPrompt.trim() }];
      const res = await previewWorkshopAiEdit({
        instruction: aiPrompt.trim(),
        history: aiMessages,
        draft: {
          title,
          summary,
          tags: parsedTags,
          theme,
          layout,
        },
      });

      setTitle(res.draft.title || "");
      setSummary(res.draft.summary || "");
      setTagsText((res.draft.tags || []).join(", "));
      setTheme({ ...DEFAULT_THEME, ...(res.draft.theme || {}) });
      setLayout(res.draft.layout || createDefaultWorkshopLayout());
      setAiMessages([...nextHistory, { role: "assistant", content: res.assistantMessage || "" }]);
      setAiModel(res.model || "");
      setAiPrompt("");
      setAiTouched(true);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error(t("workshop.titleRequired"));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title,
        summary,
        previewImageUrl,
        tags: parsedTags,
        shared,
        theme,
        layout,
        changeSummary,
        changeSource: aiTouched ? ("ai" as const) : ("manual" as const),
      };

      if (isEdit && id) {
        const res = await updateWorkshopTemplate(id, payload);
        toast.success(t("workshop.saved"));
        nav(`/workshop/templates/${res.template._id}`);
      } else {
        const res = await createWorkshopTemplate(payload);
        toast.success(t("workshop.saved"));
        nav(`/workshop/templates/${res.template._id}`);
      }
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  function setComponentCss(type: "card" | "button" | "title", value: string) {
    markManualChange();
    setTheme((prev) => ({
      ...prev,
      componentCss: {
        card: prev.componentCss?.card || "",
        button: prev.componentCss?.button || "",
        title: prev.componentCss?.title || "",
        [type]: value,
      },
    }));
  }

  const componentCssHint = "Allowed declarations only: color, background-color, border-radius, border-color, font-size, font-weight, letter-spacing, line-height, padding, margin, box-shadow, opacity.";

  return (
    <div className="mx-auto max-w-7xl p-4 ws-custom">
      <Link to="/workshop" className="text-sm text-gray-400 hover:text-white">{t("workshop.back")}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white ws-title">{isEdit ? t("workshop.editTemplate") : t("workshop.createTemplate")}</h1>
          <p className="mt-1 text-sm text-gray-400">{t("workshop.layoutEditorDesc")}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">{t("workshop.currentSiteVersion")}: {CURRENT_DEFAULT_TEMPLATE_VERSION}</span>
          <span className="rounded-full border border-cyan-700/70 px-2 py-1 text-cyan-200">{t("workshop.templateBaseVersion")}: {templateVersion}</span>
          {aiModel && <span className="rounded-full border border-emerald-700/70 px-2 py-1 text-emerald-200">{t("workshop.aiModel")}: {aiModel}</span>}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-gray-400">{t("common.loading")}</p>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr,0.95fr]">
          <div className="space-y-4">
            <section className="rounded-3xl border border-gray-800 bg-gray-900/80 p-4 ws-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-white">{t("workshop.layoutEditor")}</h2>
                  <p className="mt-1 text-xs text-gray-400">{t("workshop.dragResizeHint")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextLayout = createDefaultWorkshopLayout();
                    setLayoutAndMark(nextLayout);
                    setSelectedId(nextLayout.pages.home.items[0]?.id || null);
                  }}
                  className="ws-button rounded-lg border border-gray-700 px-3 py-1.5 text-sm"
                >
                  {t("workshop.resetLayout")}
                </button>
              </div>

              <div className="mt-4">
                <WorkshopLayoutCanvas
                  layout={layout}
                  theme={theme}
                  editable
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onChange={setLayoutAndMark}
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
                <div>
                  <h3 className="text-sm font-semibold text-white">{t("workshop.layerManager")}</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {layout.pages.home.items.map((item) => {
                      const selected = selectedId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className={`rounded-2xl border p-3 text-left transition ${selected ? "border-cyan-500 bg-cyan-950/20" : "border-gray-800 bg-gray-950/40 hover:border-gray-700"}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium text-white">{item.label}</div>
                              <div className="mt-1 text-xs text-gray-400">{item.description}</div>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-300">
                              <input
                                type="checkbox"
                                checked={item.visible !== false}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  setLayoutAndMark(updateLayoutItem(layout, item.id, (current) => ({ ...current, visible: e.target.checked })));
                                }}
                              />
                              {item.visible !== false ? t("workshop.showBlock") : t("workshop.hideBlock")}
                            </label>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
                  <h3 className="text-sm font-semibold text-white">{t("workshop.selectedBlock")}</h3>
                  {!selectedItem ? (
                    <p className="mt-2 text-sm text-gray-400">{t("workshop.noBlockSelected")}</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="text-sm text-white">{selectedItem.label}</div>
                        <div className="text-xs text-gray-400">{selectedItem.description}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <label className="text-gray-300">
                          {t("workshop.posX")}
                          <input type="number" value={Math.round(selectedItem.x)} onChange={(e) => updateSelectedItem("x", Number(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2" />
                        </label>
                        <label className="text-gray-300">
                          {t("workshop.posY")}
                          <input type="number" value={Math.round(selectedItem.y)} onChange={(e) => updateSelectedItem("y", Number(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2" />
                        </label>
                        <label className="text-gray-300">
                          {t("workshop.width")}
                          <input type="number" value={Math.round(selectedItem.w)} onChange={(e) => updateSelectedItem("w", Number(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2" />
                        </label>
                        <label className="text-gray-300">
                          {t("workshop.height")}
                          <input type="number" value={Math.round(selectedItem.h)} onChange={(e) => updateSelectedItem("h", Number(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2" />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-sm font-semibold text-white">{t("workshop.layoutJson")}</div>
                <pre className="mt-2 max-h-72 overflow-auto rounded-2xl border border-gray-800 bg-gray-950/60 p-3 text-xs text-gray-300">{layoutJson}</pre>
              </div>
            </section>

            <section className="rounded-3xl border border-gray-800 bg-gray-900/80 p-4 ws-card">
              <h2 className="text-base font-semibold text-white">{t("workshop.templateMeta")}</h2>
              <div className="mt-4 space-y-3">
                <input value={title} onChange={(e) => { markManualChange(); setTitle(e.target.value); }} className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2" placeholder={t("workshop.templateTitle")} />
                <textarea value={summary} onChange={(e) => { markManualChange(); setSummary(e.target.value); }} rows={3} className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2" placeholder={t("workshop.templateSummary")} />
                <input value={tagsText} onChange={(e) => { markManualChange(); setTagsText(e.target.value); }} className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2" placeholder={t("workshop.templateTags")} />
                <div className="flex flex-wrap gap-2">
                  {parsedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="rounded-full border border-cyan-700/60 px-3 py-1 text-xs text-cyan-200 hover:bg-cyan-950/30"
                    >
                      #{tag} ×
                    </button>
                  ))}
                </div>
                <div>
                  <div className="text-xs text-gray-400">{t("workshop.hotTagsLabel")}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {hotTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => appendTag(tag)}
                        className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" checked={shared} onChange={(e) => { markManualChange(); setShared(e.target.checked); }} />
                    {t("workshop.shareTemplate")}
                  </label>
                  <label className="ws-button cursor-pointer rounded-lg border border-gray-700 px-3 py-1.5 text-sm">
                    {t("workshop.uploadPreview")}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePreviewUpload(e.target.files?.[0] || null)} />
                  </label>
                </div>

                {previewImageUrl && <img src={previewImageUrl} alt="preview" className="h-44 w-full rounded-2xl border border-gray-800 object-cover" />}

                <textarea value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} rows={2} className="w-full rounded-xl border border-gray-700 bg-gray-950 px-3 py-2" placeholder={t("workshop.saveNotePlaceholder")} />

                <button disabled={saving} onClick={handleSave} className="ws-button w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
                  {saving ? t("workshop.saving") : t("workshop.saveTemplate")}
                </button>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-3xl border border-gray-800 bg-gray-900/80 p-4 ws-card">
              <h2 className="text-base font-semibold text-white">{t("workshop.aiEditTitle")}</h2>
              <p className="mt-1 text-xs text-gray-400">{t("workshop.aiSafeHint")}</p>
              <div className="mt-4 space-y-3">
                <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={4} className="w-full rounded-2xl border border-gray-700 bg-gray-950 px-3 py-2" placeholder={t("workshop.aiInstructionPlaceholder")} />
                <button disabled={aiBusy} onClick={handleApplyAi} className="ws-button w-full rounded-xl border border-cyan-600 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50">
                  {aiBusy ? t("workshop.aiApplying") : t("workshop.aiApply")}
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-3">
                <div className="text-sm font-semibold text-white">{t("workshop.aiConversation")}</div>
                {aiMessages.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-400">{t("workshop.aiNoMessages")}</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {aiMessages.map((message, index) => (
                      <div key={`${message.role}-${index}`} className={`rounded-2xl px-3 py-2 text-sm ${message.role === "assistant" ? "bg-gray-800 text-gray-100" : "bg-cyan-950/30 text-cyan-50"}`}>
                        <div className="mb-1 text-[10px] uppercase tracking-[0.22em] text-gray-400">{message.role}</div>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-gray-800 bg-gray-900/80 p-4 ws-card">
              <h2 className="text-base font-semibold text-white">{t("workshop.editorStyle")}</h2>
              <div className="mt-4 space-y-3">
                <label className="text-xs text-gray-400">{t("workshop.background")}</label>
                <label className="ws-button inline-block cursor-pointer rounded-lg border border-gray-700 px-3 py-1.5 text-sm">
                  {t("workshop.uploadBackgroundMedia")}
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleBackgroundUpload(e.target.files?.[0] || null)} />
                </label>

                <select value={theme.backgroundType} onChange={(e) => { markManualChange(); setTheme((prev) => ({ ...prev, backgroundType: e.target.value as WorkshopTheme["backgroundType"] })); }} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2">
                  <option value="none">None</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="gradient">Gradient</option>
                </select>

                <input value={theme.backgroundUrl || ""} onChange={(e) => { markManualChange(); setTheme((prev) => ({ ...prev, backgroundUrl: e.target.value })); }} className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2" placeholder="Background URL" />

                <div className="grid grid-cols-2 gap-2">
                  <input type="color" value={theme.accentColor || "#22d3ee"} onChange={(e) => { markManualChange(); setTheme((prev) => ({ ...prev, accentColor: e.target.value })); }} className="h-10 w-full rounded-lg border border-gray-700 bg-gray-950 px-2" />
                  <input type="color" value={theme.textColor || "#f3f4f6"} onChange={(e) => { markManualChange(); setTheme((prev) => ({ ...prev, textColor: e.target.value })); }} className="h-10 w-full rounded-lg border border-gray-700 bg-gray-950 px-2" />
                </div>

                <label className="text-xs text-gray-400">{t("workshop.cardRadius")}: {theme.cardRadius || 16}px</label>
                <input type="range" min={0} max={48} value={theme.cardRadius || 16} onChange={(e) => { markManualChange(); setTheme((prev) => ({ ...prev, cardRadius: Number(e.target.value) })); }} className="w-full" />

                <label className="text-xs text-gray-400">{t("workshop.cardOpacity")}: {theme.cardOpacity || 0.92}</label>
                <input type="range" min={0.25} max={1} step={0.01} value={theme.cardOpacity || 0.92} onChange={(e) => { markManualChange(); setTheme((prev) => ({ ...prev, cardOpacity: Number(e.target.value) })); }} className="w-full" />

                <div className="space-y-2 border-t border-gray-800 pt-2">
                  <p className="text-xs text-gray-400">{t("workshop.rightClickHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    <button className="ws-button rounded-lg border border-gray-700 px-2 py-1 text-xs" onClick={() => setCssModalOpen("card")}>{t("workshop.editCardCss")}</button>
                    <button className="ws-button rounded-lg border border-gray-700 px-2 py-1 text-xs" onClick={() => setCssModalOpen("button")}>{t("workshop.editButtonCss")}</button>
                    <button className="ws-button rounded-lg border border-gray-700 px-2 py-1 text-xs" onClick={() => setCssModalOpen("title")}>{t("workshop.editTitleCss")}</button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {cssModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-700 bg-gray-900 p-4">
            <h3 className="font-semibold text-white">Edit {cssModalOpen} CSS</h3>
            <p className="mt-1 text-xs text-gray-400">{componentCssHint}</p>
            <textarea rows={8} value={theme.componentCss?.[cssModalOpen] || ""} onChange={(e) => setComponentCss(cssModalOpen, e.target.value)} className="mt-3 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 font-mono text-sm" placeholder="color: #fff; border-radius: 16px;" />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setCssModalOpen(null)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm">{t("common.cancel")}</button>
              <button onClick={() => setCssModalOpen(null)} className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black">{t("common.confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}