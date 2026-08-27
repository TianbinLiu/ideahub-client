import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { CircleUserRound, Mail, MessageCircle, QrCode, Smartphone, X } from "lucide-react";
import { API_BASE } from "../config";
import { apiFetch, getAuthCapabilities, phoneLoginStart, phoneLoginVerify, type AuthCapabilities } from "../api";
import { useAuth } from "../authContext";
import { humanizeError } from "../utils/humanizeError";
import { safeNext } from "../utils/safeNext";
import { CharCount } from "./CharCount";

type AuthDialogMode = "login" | "register";
type Step = "START" | "VERIFY";
type LoginMethod = "wechat" | "qq" | "phone" | "email" | "google" | "github";

const LIMITS = {
  USERNAME: 50,
  EMAIL: 100,
};

const QR_BLOCKS = [
  "1111111010011111111",
  "1000001011010000001",
  "1011101000010111001",
  "1011101011110111001",
  "1011101001010111001",
  "1000001010010000001",
  "1111111010101111111",
  "0000000011100000000",
  "1010111110001101011",
  "0101000011110010100",
  "1110011010101111011",
  "0011100010010001100",
  "1010111111010111011",
  "0000000010110010100",
  "1111111011011111011",
  "1000001010000010000",
  "1011101011111011111",
  "1011101000011010101",
  "1111111011011110111",
];

type AuthDialogProps = {
  initialMode?: AuthDialogMode;
  next?: string | null;
  onClose?: () => void;
};

function getServerBase() {
  return API_BASE ? API_BASE.replace(/\/$/, "") : window.location.origin;
}

function GoogleMark() {
  return <span aria-hidden="true" className="h-4 w-4 rounded-full bg-gradient-to-br from-red-400 via-yellow-300 to-blue-500" />;
}

function MethodIcon({ method }: { method: LoginMethod }) {
  if (method === "email") return <Mail className="h-4 w-4" />;
  if (method === "phone") return <Smartphone className="h-4 w-4" />;
  if (method === "google") return <GoogleMark />;
  if (method === "github") return <span aria-hidden="true" className="h-4 w-4 rounded-full bg-gray-100" />;
  if (method === "qq") return <span aria-hidden="true" className="h-4 w-4 rounded-full bg-sky-400" />;
  return <MessageCircle className="h-4 w-4" />;
}

export default function AuthDialog({ initialMode = "login", next, onClose }: AuthDialogProps) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const { loginWithToken } = useAuth();
  const resolvedNext = safeNext(next || "/");

  const [mode, setMode] = useState<AuthDialogMode>(initialMode);
  const [authCaps, setAuthCaps] = useState<AuthCapabilities | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [oauthLoading, setOauthLoading] = useState<LoginMethod | null>(null);

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneStep, setPhoneStep] = useState<Step>("START");
  const [phoneCode, setPhoneCode] = useState("");

  const [step, setStep] = useState<Step>("START");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "company">("user");
  const [startWithGroups, setStartWithGroups] = useState(true);
  const [code, setCode] = useState("");
  const defaultCooldown = Number((import.meta as any).env?.VITE_OTP_RESEND_COOLDOWN_SECONDS) || 60;
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const caps = await getAuthCapabilities();
        if (mounted) setAuthCaps(caps);
      } catch {
        // Keep null to fall back to global login options.
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      setCooldown((current) => {
        if (current <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [cooldown]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const oauthQueryOverride = new URLSearchParams(loc.search).get("oauth");
  const forceShowOAuth =
    oauthQueryOverride === "1" ||
    oauthQueryOverride === "true" ||
    (import.meta as any).env?.VITE_AUTH_FORCE_SHOW_OAUTH === "1";
  const forceHideOAuth =
    oauthQueryOverride === "0" ||
    oauthQueryOverride === "false" ||
    (import.meta as any).env?.VITE_AUTH_FORCE_HIDE_OAUTH === "1";

  // 预览/联调覆盖：?region=cn 强制中国区登录套、?region=global（或 intl）强制海外套。
  // 仅覆盖【展示哪组登录按钮】这一 UI，不改真实鉴权后端；便于在非 CN 网络下预览 CN 界面
  // （与上面 ?oauth= 覆盖同一套思路）。默认仍按服务端 detectRegion 下发的 region。
  const regionQueryOverride = new URLSearchParams(loc.search).get("region")?.toLowerCase();
  const isChinaRegion =
    regionQueryOverride === "cn"
      ? true
      : regionQueryOverride === "global" || regionQueryOverride === "intl"
        ? false
        : authCaps?.region === "CN";
  const shouldShowOAuth = forceShowOAuth
    ? true
    : forceHideOAuth
      ? false
      : authCaps
        ? authCaps.oauthEnabled && authCaps.providers.length > 0
        : true;
  const oauthProviders = authCaps?.providers?.length ? authCaps.providers : ["google", "github"];

  // 手机短信登录仅在【真实短信通道已配置】时出现（capabilities.phoneEnabled）；
  // ?phone=1 是预览覆盖，便于在后端尚未配短信时也能看/测这套 UI（与 ?oauth=/?region= 同思路）。
  const phoneQueryOverride = new URLSearchParams(loc.search).get("phone");
  const forceShowPhone = phoneQueryOverride === "1" || phoneQueryOverride === "true";
  const phoneEnabled = forceShowPhone || authCaps?.phoneEnabled === true;

  const baseLoginMethods: LoginMethod[] = isChinaRegion
    ? ["wechat", "qq", "phone", "email"]
    : ["google", "github", "phone", "email"];
  const loginMethods: LoginMethod[] = baseLoginMethods.filter((m) => m !== "phone" || phoneEnabled);

  const canSend = Boolean(username.trim() && email.trim() && password.length >= 6);
  const canVerify = canSend && Boolean(code.trim());
  const qrTitle = isChinaRegion && loginMethod === "wechat"
    ? t("auth.scanWithWeChat")
    : isChinaRegion && loginMethod === "qq"
      ? t("auth.scanWithQQ")
      : t("auth.scanWithMobile");

  function methodLabel(method: LoginMethod) {
    if (method === "wechat") return t("auth.wechatLogin");
    if (method === "qq") return t("auth.qqLogin");
    if (method === "phone") return t("auth.phoneLogin");
    if (method === "google") return t("auth.googleLogin");
    if (method === "github") return t("auth.githubLogin");
    return t("auth.emailLogin");
  }

  function switchMode(nextMode: AuthDialogMode) {
    setMode(nextMode);
    setErr("");
    setLoginMethod("email");
    setPhoneStep("START");
    setPhoneCode("");
  }

  async function startOauth(provider: "google" | "github") {
    if (!shouldShowOAuth || !oauthProviders.includes(provider)) {
      toast.error(t("auth.thirdPartyUnavailable"));
      return;
    }

    try {
      setOauthLoading(provider);
      const url = new URL(`${getServerBase()}/api/auth/oauth/${provider}`);
      url.searchParams.set("next", resolvedNext);
      toast.loading(`Redirecting to ${provider}...`, { id: `oauth-${provider}` });
      window.location.assign(url.toString());
    } catch (error: any) {
      toast.error(error?.message || "OAuth redirect failed");
      setOauthLoading(null);
    }
  }

  function selectLoginMethod(method: LoginMethod) {
    setErr("");
    setLoginMethod(method);
    setPhoneStep("START");
    setPhoneCode("");
    if (method === "google" || method === "github") {
      void startOauth(method);
    }
  }

  async function submitLogin() {
    try {
      setErr("");
      setLoading(true);
      const res = await apiFetch<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ emailOrUsername, password: loginPassword }),
      });

      await loginWithToken(res.token);
      toast.success("Welcome back!");
      onClose?.();
      nav(resolvedNext, { replace: true });
    } catch (error: any) {
      const msg = humanizeError(error);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loading && emailOrUsername.trim() && loginPassword) {
      void submitLogin();
    }
  }

  async function sendCode() {
    try {
      setErr("");
      setLoading(true);
      await apiFetch("/api/auth/email/register/start", {
        method: "POST",
        body: JSON.stringify({ username, email, password }),
      });

      toast.success(t("auth.verificationSent"));
      setStep("VERIFY");
      setCooldown(defaultCooldown);
    } catch (error: any) {
      if (error?.code === "OTP_RESEND_COOLDOWN" && error?.details?.retryAfter) {
        setCooldown(Number(error.details.retryAfter) || defaultCooldown);
      }
      const msg = humanizeError(error);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndCreate() {
    try {
      setErr("");
      setLoading(true);
      const res = await apiFetch<{ ok: true; token: string }>("/api/auth/email/register/verify", {
        method: "POST",
        body: JSON.stringify({ username, email, password, role, code }),
      });

      await loginWithToken(res.token);
      toast.success("Account created!");
      onClose?.();
      nav(startWithGroups ? "/groups?onboarding=1" : resolvedNext, { replace: true });
    } catch (error: any) {
      const msg = humanizeError(error);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function sendPhoneCode() {
    // 前端先做一次宽松校验（去空格/+86 后应为 1 开头 11 位）；服务端会再严格校验。
    const normalized = phone.replace(/[\s-]/g, "").replace(/^\+?86/, "");
    if (!/^1[3-9]\d{9}$/.test(normalized)) {
      const msg = t("auth.invalidPhone");
      setErr(msg);
      toast.error(msg);
      return;
    }
    try {
      setErr("");
      setLoading(true);
      await phoneLoginStart(phone.trim());
      toast.success(t("auth.smsCodeSent"));
      setPhoneStep("VERIFY");
      setCooldown(defaultCooldown);
    } catch (error: any) {
      if (error?.code === "OTP_RESEND_COOLDOWN" && error?.details?.retryAfter) {
        setCooldown(Number(error.details.retryAfter) || defaultCooldown);
      }
      const msg = humanizeError(error);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function verifyPhoneLogin() {
    try {
      setErr("");
      setLoading(true);
      const res = await phoneLoginVerify(phone.trim(), phoneCode.trim());
      await loginWithToken(res.token);
      toast.success(t("auth.phoneLoginSuccess"));
      onClose?.();
      // 新建账号引导到群组 onboarding；已有账号回原目标。
      nav(res.created ? "/groups?onboarding=1" : resolvedNext, { replace: true });
    } catch (error: any) {
      const msg = humanizeError(error);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  function renderQrPattern() {
    return (
      <div className="grid h-36 w-36 grid-cols-[repeat(19,1fr)] grid-rows-[repeat(19,1fr)] gap-[1px] rounded-xl border border-gray-300 bg-white p-2">
        {QR_BLOCKS.join("").split("").map((value, index) => (
          <span key={index} className={value === "1" ? "bg-gray-950" : "bg-white"} />
        ))}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[2300] flex items-start justify-center bg-black/55 px-4 py-10 backdrop-blur-sm" role="presentation">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-[760px] overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-800 text-gray-400 hover:bg-gray-900 hover:text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid md:grid-cols-[280px,1fr]">
          <div className="border-b border-gray-800 bg-gray-100 p-6 text-gray-950 md:border-b-0 md:border-r">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500 text-black">
                <CircleUserRound className="h-7 w-7" />
              </div>
              <div>
                <div className="text-lg font-bold">{t("common.brand")}</div>
                <div className="text-xs text-gray-500">{isChinaRegion ? t("auth.regionChinaLogin") : t("auth.regionGlobalLogin")}</div>
              </div>
            </div>
            <div className="mt-7 flex flex-col items-center">
              {renderQrPattern()}
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
                <QrCode className="h-4 w-4" />
                {qrTitle}
              </div>
              <div className="mt-2 text-center text-xs leading-5 text-gray-500">{t("auth.qrLoginHint")}</div>
            </div>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-2 rounded-full border border-gray-800 bg-gray-900 p-1 text-sm font-semibold">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`rounded-full px-4 py-2 ${mode === "login" ? "bg-white text-black" : "text-gray-300 hover:text-white"}`}
              >
                {t("nav.login")}
              </button>
              <button
                type="button"
                onClick={() => switchMode("register")}
                className={`rounded-full px-4 py-2 ${mode === "register" ? "bg-white text-black" : "text-gray-300 hover:text-white"}`}
              >
                {t("nav.register")}
              </button>
            </div>

            {mode === "login" ? (
              <>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  {loginMethods.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => selectLoginMethod(method)}
                      disabled={(method === "google" || method === "github") && oauthLoading === method}
                      className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs transition ${loginMethod === method ? "border-cyan-400 bg-cyan-500/15 text-cyan-100" : "border-gray-800 bg-gray-900 text-gray-300 hover:bg-gray-800"}`}
                    >
                      <MethodIcon method={method} />
                      {methodLabel(method)}
                    </button>
                  ))}
                </div>

                <div className="mt-4">
                  {loginMethod === "email" ? (
                    <form className="grid gap-3" onSubmit={handleLoginSubmit}>
                      <input
                        className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
                        placeholder={t("auth.emailOrUsername")}
                        value={emailOrUsername}
                        onChange={(event) => setEmailOrUsername(event.target.value)}
                        disabled={loading}
                        autoComplete="username"
                      />
                      <input
                        className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
                        placeholder={t("auth.password")}
                        type="password"
                        value={loginPassword}
                        onChange={(event) => setLoginPassword(event.target.value)}
                        disabled={loading}
                        autoComplete="current-password"
                      />
                      <button
                        type="submit"
                        disabled={loading || !emailOrUsername.trim() || !loginPassword}
                        className="rounded-xl bg-white px-4 py-2 font-semibold text-black disabled:opacity-50"
                      >
                        {loading ? t("auth.loggingIn") : t("auth.loginButton")}
                      </button>
                      <div className="flex items-center justify-end text-xs">
                        <Link to={`/reset?next=${encodeURIComponent(resolvedNext)}`} onClick={onClose} className="text-gray-300 underline decoration-gray-700 hover:text-white">
                          {t("auth.forgotPassword")}
                        </Link>
                      </div>
                    </form>
                  ) : loginMethod === "phone" ? (
                    <div className="grid gap-3">
                      <input
                        className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
                        placeholder={t("auth.phonePlaceholder")}
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        disabled={loading || phoneStep === "VERIFY"}
                        inputMode="tel"
                        autoComplete="tel"
                      />
                      {phoneStep === "VERIFY" ? (
                        <>
                          <input
                            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 tracking-widest"
                            placeholder={t("auth.verificationCodePlaceholder")}
                            value={phoneCode}
                            onChange={(event) => setPhoneCode(event.target.value)}
                            disabled={loading}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                          />
                          <button
                            type="button"
                            onClick={verifyPhoneLogin}
                            disabled={loading || !phoneCode.trim()}
                            className="rounded-xl bg-white px-4 py-2 font-semibold text-black disabled:opacity-50"
                          >
                            {loading ? t("auth.verifying") : t("auth.loginButton")}
                          </button>
                          <button
                            type="button"
                            onClick={sendPhoneCode}
                            disabled={loading || cooldown > 0}
                            className="rounded-xl border border-gray-700 px-3 py-2 text-gray-200 hover:bg-gray-950 disabled:opacity-50"
                          >
                            {cooldown > 0 ? t("auth.resendCodeWait", { seconds: cooldown }) : t("auth.resendCode")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={sendPhoneCode}
                          disabled={loading || !phone.trim()}
                          className="rounded-xl bg-white px-4 py-2 font-semibold text-black disabled:opacity-50"
                        >
                          {loading ? t("auth.sendingCode") : t("auth.sendSmsCode")}
                        </button>
                      )}
                      <p className="text-xs text-gray-500">{t("auth.phoneLoginHint")}</p>
                    </div>
                  ) : loginMethod === "wechat" || loginMethod === "qq" ? (
                    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
                      {t("auth.qrLoginUnavailable")}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-400">
                      {shouldShowOAuth ? t("auth.oauthOpening") : t("auth.thirdPartyUnavailable")}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="mt-4 grid gap-3">
                <div>
                  <input
                    className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
                    placeholder={t("auth.username")}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    disabled={loading || step === "VERIFY"}
                    maxLength={LIMITS.USERNAME}
                  />
                  <CharCount current={username.length} max={LIMITS.USERNAME} className="mt-1" />
                </div>
                <div>
                  <input
                    className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
                    placeholder={t("auth.email")}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={loading || step === "VERIFY"}
                    maxLength={LIMITS.EMAIL}
                  />
                  <CharCount current={email.length} max={LIMITS.EMAIL} className="mt-1" />
                </div>
                <input
                  className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
                  placeholder={t("auth.passwordHint")}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={loading || step === "VERIFY"}
                />
                <div className="flex gap-2 text-sm">
                  <button className={`flex-1 rounded-xl border px-3 py-2 ${role === "user" ? "border-white text-white" : "border-gray-700 text-gray-300"}`} onClick={() => setRole("user")} type="button" disabled={loading || step === "VERIFY"}>
                    {t("auth.creator")}
                  </button>
                  <button className={`flex-1 rounded-xl border px-3 py-2 ${role === "company" ? "border-white text-white" : "border-gray-700 text-gray-300"}`} onClick={() => setRole("company")} type="button" disabled={loading || step === "VERIFY"}>
                    {t("auth.company")}
                  </button>
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950/40 px-3 py-2 text-sm text-gray-300">
                  <input type="checkbox" checked={startWithGroups} onChange={(event) => setStartWithGroups(event.target.checked)} disabled={loading} />
                  {t("auth.startWithGroups")}
                </label>

                {step === "VERIFY" ? (
                  <input className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 tracking-widest" placeholder={t("auth.verificationCodePlaceholder")} value={code} onChange={(event) => setCode(event.target.value)} disabled={loading} />
                ) : null}

                {step === "START" ? (
                  <button onClick={sendCode} disabled={loading || !canSend} className="rounded-xl bg-white px-4 py-2 font-semibold text-black disabled:opacity-50" type="button">
                    {loading ? t("auth.sendingCode") : t("auth.sendVerificationCode")}
                  </button>
                ) : (
                  <div className="grid gap-2">
                    <button onClick={verifyAndCreate} disabled={loading || !canVerify} className="rounded-xl bg-white px-4 py-2 font-semibold text-black disabled:opacity-50" type="button">
                      {loading ? t("auth.verifying") : t("auth.verifyAndCreate")}
                    </button>
                    <button onClick={sendCode} disabled={loading || cooldown > 0} className="rounded-xl border border-gray-700 px-3 py-2 text-gray-200 hover:bg-gray-950 disabled:opacity-50" type="button">
                      {cooldown > 0 ? t("auth.resendCodeWait", { seconds: cooldown }) : t("auth.resendCode")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {err ? <p className="mt-3 text-sm text-red-400">{t("common.error")}: {err}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
