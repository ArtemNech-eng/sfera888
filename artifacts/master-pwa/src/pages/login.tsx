import { useState, useCallback, memo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Eye, EyeOff, HardHat, ChevronLeft, RussianRuble } from "lucide-react";


function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "7" + digits;
  if (digits.length === 11 && digits[0] === "8") return "7" + digits.slice(1);
  if (digits.length === 11 && digits[0] === "7") return digits;
  return digits;
}

function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length > 0 && !digits.startsWith("7")) digits = "7" + digits;
  digits = digits.slice(0, 11);
  let out = "";
  if (digits.length >= 1) out = "+" + digits[0];
  if (digits.length >= 2) out += " (" + digits.slice(1, Math.min(4, digits.length));
  if (digits.length >= 5) out += ") " + digits.slice(4, Math.min(7, digits.length));
  if (digits.length >= 8) out += "-" + digits.slice(7, Math.min(9, digits.length));
  if (digits.length >= 10) out += "-" + digits.slice(9, 11);
  return out;
}

const inputCls = "w-full h-12 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

// ── Memoized single spec chip ──────────────────────────────────────────────
const SpecChip = memo(function SpecChip({
  spec, active, onToggle,
}: { spec: string; active: boolean; onToggle: (s: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(spec)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
        active
          ? "bg-primary text-white border-primary shadow-sm"
          : "bg-card text-muted-foreground border-input hover:border-primary/50 hover:text-foreground"
      }`}
    >
      {spec}
    </button>
  );
});

// ── Memoized specs grid – only re-renders when specs array changes ──────────
const SpecsGrid = memo(function SpecsGrid({
  specs, selected, onToggle, error,
}: { specs: string[]; selected: string[]; onToggle: (s: string) => void; error?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">
        Специальности * <span className="text-muted-foreground font-normal">(можно несколько)</span>
      </label>
      <div className="flex flex-wrap gap-2 pt-0.5">
        {specs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Загрузка услуг...</p>
        ) : specs.map(spec => (
          <SpecChip
            key={spec}
            spec={spec}
            active={selected.includes(spec)}
            onToggle={onToggle}
          />
        ))}
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
});

// ── Prices step ────────────────────────────────────────────────────────────
function PricesStep({
  specs,
  prices,
  onPriceChange,
  errors,
  onBack,
  onSubmit,
  loading,
}: {
  specs: string[];
  prices: Record<string, string>;
  onPriceChange: (spec: string, value: string) => void;
  errors: Record<string, string>;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-5">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Назад
        </button>
        <h2 className="text-base font-semibold text-foreground">Укажите ваши цены</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Минимальная стоимость по каждой услуге — клиенты увидят это при выборе мастера
        </p>
      </div>

      <div className="space-y-3">
        {specs.map(spec => (
          <div key={spec} className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{spec}</label>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={prices[spec] ?? ""}
                onChange={e => onPriceChange(spec, e.target.value)}
                placeholder="от 0"
                className={`${inputCls} pr-14 ${errors[spec] ? "border-red-400 ring-1 ring-red-400" : ""}`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm flex items-center gap-0.5">
                <RussianRuble className="w-3.5 h-3.5" />
              </span>
            </div>
            {errors[spec] && <p className="text-xs text-red-500 font-medium">{errors[spec]}</p>}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={loading}
        style={{ minHeight: 52 }}
        className="w-full bg-primary text-white font-semibold text-base rounded-xl disabled:opacity-50 transition-opacity active:opacity-80 flex items-center justify-center gap-2"
      >
        {loading
          ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : "Зарегистрироваться"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        После регистрации менеджер свяжется с вами
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { login, register } = useAuth();
  // Max bot ID from URL (?max=<chatId>) — set during registration/login to auto-link bot
  const maxChatId = new URLSearchParams(window.location.search).get("max");
  const [tab, setTab] = useState<"login" | "register">(() => {
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    return urlTab === "register" ? "register" : "login";
  });

  // Login form
  const [form, setForm] = useState({ login: "", password: "" });
  const [showPass, setShowPass] = useState(false);

  // Forgot password
  const [forgotView, setForgotView] = useState(false);
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotNewPass, setForgotNewPass] = useState("");
  const [forgotNewPassConfirm, setForgotNewPassConfirm] = useState("");
  const [showForgotPass, setShowForgotPass] = useState(false);
  const [forgotDone, setForgotDone] = useState<{ login: string; customPass: boolean } | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotPhone) { toast.error("Введите номер телефона"); return; }
    if (forgotNewPass && forgotNewPass.length < 4) { toast.error("Пароль должен быть не короче 4 символов"); return; }
    if (forgotNewPass && forgotNewPass !== forgotNewPassConfirm) { toast.error("Пароли не совпадают"); return; }
    setForgotLoading(true);
    try {
      const res = await fetch("/api/master-pwa/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: forgotPhone, newPassword: forgotNewPass || undefined }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка");
      setForgotDone({ login: data.login, customPass: !!forgotNewPass });
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка сброса пароля");
    } finally {
      setForgotLoading(false);
    }
  };

  // Register form — specs separated to avoid full re-render on each toggle
  const [reg, setReg] = useState({ alias: "", phone: "", city: "", password: "" });
  const [specs, setSpecs] = useState<string[]>([]);
  const [availableSpecs, setAvailableSpecs] = useState<string[]>([]);
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [showRegPass, setShowRegPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});

  // Step: "info" = main form, "prices" = prices step
  const [regStep, setRegStep] = useState<"info" | "prices">("info");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/settings/services")
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: number; name: string }[]) => setAvailableSpecs(data.map(s => s.name)))
      .catch(() => {});
    fetch("/api/settings/cities")
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: number; name: string }[]) => setAvailableCities(data.map(c => c.name)))
      .catch(() => {});
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.login || !form.password) { toast.error("Введите логин и пароль"); return; }
    setLoading(true);
    try {
      await login(form.login, form.password, maxChatId);
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  // Step 1 validation → go to prices step
  const handleNextStep = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!reg.alias.trim()) errs.alias = "Введите имя или псевдоним";
    const phoneNorm = normalizePhone(reg.phone);
    if (phoneNorm.length < 10 || phoneNorm.length > 11) errs.phone = "Введите корректный номер телефона";
    if (!reg.city) errs.city = "Выберите город";
    if (specs.length === 0) errs.specs = "Выберите хотя бы одну специальность";
    if (reg.password.length < 6) errs.password = "Минимум 6 символов";
    setRegErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setRegStep("prices");
    // Reset price errors
    setPriceErrors({});
  };

  const handlePriceChange = (spec: string, value: string) => {
    setPrices(prev => ({ ...prev, [spec]: value }));
    if (value && Number(value) > 0) {
      setPriceErrors(prev => { const n = { ...prev }; delete n[spec]; return n; });
    }
  };

  // Step 2: submit registration
  const handleRegister = async () => {
    // Validate prices
    const errs: Record<string, string> = {};
    for (const spec of specs) {
      const val = prices[spec];
      if (!val || Number(val) <= 0) {
        errs[spec] = "Укажите цену";
      }
    }
    setPriceErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const phoneNorm = normalizePhone(reg.phone);
    const servicePrices = specs.map(spec => ({
      service: spec,
      priceFrom: Number(prices[spec]),
    }));

    setLoading(true);
    try {
      await register({
        alias: reg.alias.trim(),
        phone: "+" + phoneNorm,
        city: reg.city,
        specialization: specs.join(", "),
        specializations: specs,
        login: phoneNorm,
        password: reg.password,
        servicePrices,
        ...(maxChatId ? { maxChatId } : {}),
      });
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка регистрации");
      setRegStep("info");
    } finally {
      setLoading(false);
    }
  };

  // Stable callback — SpecChip won't re-render because of this reference
  const toggleSpec = useCallback((spec: string) => {
    setSpecs(prev =>
      prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]
    );
    setRegErrors(er => er.specs ? { ...er, specs: "" } : er);
  }, []);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10 bg-background relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full blur-[140px] opacity-30"
           style={{ background: "radial-gradient(ellipse, #c4b5fd 0%, #a78bfa 50%, transparent 100%)" }} />
      <div className="absolute bottom-0 right-0 w-[260px] h-[260px] rounded-full blur-[100px] opacity-20"
           style={{ background: "#818cf8" }} />
      <div className="absolute bottom-1/3 left-0 w-[200px] h-[200px] rounded-full blur-[80px] opacity-15"
           style={{ background: "#c084fc" }} />

      <div className="w-full max-w-sm space-y-7 relative z-10">
        {/* Logo + title */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl mx-auto mb-4"
               style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4338CA 100%)", boxShadow: "0 8px 32px rgba(124,58,237,0.4)" }}>
            <HardHat className="text-white" size={30} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Честный мастер</h1>
          <p className="text-sm text-muted-foreground">Приложение для мастеров</p>
        </div>

        {/* Forgot password view */}
        {forgotView ? (
          forgotDone ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-5 text-center space-y-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 mx-auto">
                  <svg className="text-green-600 dark:text-green-400" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div>
                  <p className="font-semibold text-green-800 dark:text-green-300 text-base">Пароль изменён!</p>
                  <p className="text-sm text-green-700 dark:text-green-400 mt-1">Войдите с этими данными:</p>
                </div>
                <div className="bg-white dark:bg-card rounded-xl p-3 text-left space-y-1 border border-green-200 dark:border-green-800">
                  <p className="text-xs text-muted-foreground">Логин</p>
                  <p className="font-mono font-semibold text-sm text-foreground">{forgotDone.login}</p>
                  <p className="text-xs text-muted-foreground mt-2">Пароль</p>
                  <p className="font-mono font-semibold text-sm text-foreground">
                    {forgotDone.customPass ? "••••••••  (тот, что вы задали)" : forgotDone.login}
                  </p>
                </div>
                {!forgotDone.customPass && (
                  <p className="text-xs text-muted-foreground">Логин и пароль — ваш номер телефона (79XXXXXXXXXX)</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setForm(f => ({ ...f, login: forgotDone!.login }));
                  setForgotView(false);
                  setForgotDone(null);
                  setForgotNewPass("");
                  setForgotNewPassConfirm("");
                  setTab("login");
                }}
                style={{ minHeight: 52 }}
                className="w-full bg-primary text-white font-semibold text-base rounded-xl transition-opacity active:opacity-80 flex items-center justify-center gap-2"
              >
                Войти
              </button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center space-y-1 pb-1">
                <p className="font-semibold text-base">Смена пароля</p>
                <p className="text-xs text-muted-foreground">Введите номер телефона и придумайте новый пароль</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Номер телефона</label>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={forgotPhone}
                  onChange={e => {
                    const v = e.target.value;
                    const isPhone = /^[\d+8]/.test(v);
                    setForgotPhone(isPhone ? formatPhoneInput(v) : v);
                  }}
                  placeholder="+7 (___) ___-__-__"
                  className={inputCls}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Новый пароль</label>
                <div className="relative">
                  <input
                    type={showForgotPass ? "text" : "password"}
                    autoComplete="new-password"
                    value={forgotNewPass}
                    onChange={e => setForgotNewPass(e.target.value)}
                    placeholder="Минимум 4 символа"
                    className={`${inputCls} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowForgotPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showForgotPass
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>

              {forgotNewPass.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Повторите пароль</label>
                  <input
                    type={showForgotPass ? "text" : "password"}
                    autoComplete="new-password"
                    value={forgotNewPassConfirm}
                    onChange={e => setForgotNewPassConfirm(e.target.value)}
                    placeholder="Ещё раз новый пароль"
                    className={`${inputCls} ${forgotNewPassConfirm && forgotNewPass !== forgotNewPassConfirm ? "border-red-400 ring-1 ring-red-400" : ""}`}
                  />
                  {forgotNewPassConfirm && forgotNewPass !== forgotNewPassConfirm && (
                    <p className="text-xs text-red-500 font-medium">Пароли не совпадают</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={forgotLoading || (forgotNewPass.length > 0 && forgotNewPass !== forgotNewPassConfirm)}
                style={{ minHeight: 52 }}
                className="w-full bg-primary text-white font-semibold text-base rounded-xl disabled:opacity-50 transition-opacity active:opacity-80 flex items-center justify-center gap-2"
              >
                {forgotLoading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : "Сохранить пароль"}
              </button>
              <button
                type="button"
                onClick={() => { setForgotView(false); setForgotPhone(""); setForgotNewPass(""); setForgotNewPassConfirm(""); setForgotDone(null); }}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                ← Назад ко входу
              </button>
            </form>
          )
        ) : (
        <>
        {/* Max bot banner — shown when coming from bot link */}
        {maxChatId && regStep === "info" && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <span className="text-lg leading-none mt-0.5">🤖</span>
            <p className="text-sm text-foreground/80 leading-snug">
              {tab === "login"
                ? "Войдите в аккаунт — бот подключится автоматически."
                : "Заполните форму — после регистрации бот подключится автоматически."
              }
              {tab === "login" && (
                <> Нет аккаунта?{" "}
                  <button type="button" onClick={() => setTab("register")} className="text-primary font-semibold underline-offset-2 hover:underline">
                    Зарегистрируйтесь
                  </button>
                </>
              )}
            </p>
          </div>
        )}

        {/* Tabs — hidden on prices step */}
        {regStep === "info" && (
          <div className="flex rounded-xl bg-muted p-1 gap-1">
            {(["login", "register"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                  tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {t === "login" ? "Вход" : "Регистрация"}
              </button>
            ))}
          </div>
        )}

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <Field label="Номер телефона / логин">
              <input
                type="text"
                autoComplete="username"
                value={form.login}
                onChange={e => {
                  const v = e.target.value;
                  const isPhone = /^[\d+8]/.test(v);
                  setForm(f => ({ ...f, login: isPhone ? formatPhoneInput(v) : v }));
                }}
                placeholder="+7 или логин"
                className={inputCls}
              />
            </Field>

            <Field label="Пароль">
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Ваш пароль"
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                >
                  {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </Field>

            <button
              type="submit"
              disabled={loading}
              style={{ minHeight: 52 }}
              className="w-full bg-primary text-white font-semibold text-base rounded-xl disabled:opacity-50 transition-opacity active:opacity-80 flex items-center justify-center gap-2"
            >
              {loading
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : "Войти"}
            </button>

            <button
              type="button"
              onClick={() => { setForgotView(true); setForgotPhone(form.login); setForgotDone(null); }}
              style={{ minHeight: 48 }}
              className="w-full border border-border rounded-xl text-sm font-medium text-foreground bg-background hover:bg-muted transition-colors"
            >
              Забыл пароль
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Обратитесь к менеджеру, если нет аккаунта
            </p>
          </form>
        ) : regStep === "prices" ? (
          <PricesStep
            specs={specs}
            prices={prices}
            onPriceChange={handlePriceChange}
            errors={priceErrors}
            onBack={() => setRegStep("info")}
            onSubmit={handleRegister}
            loading={loading}
          />
        ) : (
          <form onSubmit={handleNextStep} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Имя / псевдоним *</label>
              <input
                type="text"
                autoComplete="name"
                value={reg.alias}
                onChange={e => setReg(r => ({ ...r, alias: e.target.value }))}
                onBlur={() => { if (reg.alias.trim()) setRegErrors(er => ({ ...er, alias: "" })); }}
                placeholder="Например: Иван М."
                className={`${inputCls} ${regErrors.alias ? "border-red-400 ring-1 ring-red-400" : ""}`}
              />
              {regErrors.alias && <p className="text-xs text-red-500 font-medium">{regErrors.alias}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Номер телефона * <span className="text-muted-foreground font-normal">(используется как логин)</span>
              </label>
              <input
                type="tel"
                autoComplete="tel"
                value={reg.phone}
                onChange={e => setReg(r => ({ ...r, phone: formatPhoneInput(e.target.value) }))}
                onBlur={() => {
                  const n = normalizePhone(reg.phone);
                  if (n.length >= 10) setRegErrors(er => ({ ...er, phone: "" }));
                }}
                placeholder="+7 (___) ___-__-__"
                className={`${inputCls} ${regErrors.phone ? "border-red-400 ring-1 ring-red-400" : ""}`}
              />
              {regErrors.phone && <p className="text-xs text-red-500 font-medium">{regErrors.phone}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Город *</label>
              <select
                value={reg.city}
                onChange={e => {
                  setReg(r => ({ ...r, city: e.target.value }));
                  if (e.target.value) setRegErrors(er => ({ ...er, city: "" }));
                }}
                className={`${inputCls} appearance-none ${regErrors.city ? "border-red-400 ring-1 ring-red-400" : ""}`}
              >
                <option value="">
                  {availableCities.length === 0 ? "Загрузка городов..." : "Выберите город"}
                </option>
                {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {regErrors.city && <p className="text-xs text-red-500 font-medium">{regErrors.city}</p>}
            </div>

            {/* Memoized specs — only this section re-renders on toggle */}
            <SpecsGrid
              specs={availableSpecs}
              selected={specs}
              onToggle={toggleSpec}
              error={regErrors.specs}
            />

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Пароль * <span className="text-muted-foreground font-normal">(мин. 6 символов)</span>
              </label>
              <div className="relative">
                <input
                  type={showRegPass ? "text" : "password"}
                  autoComplete="new-password"
                  value={reg.password}
                  onChange={e => setReg(r => ({ ...r, password: e.target.value }))}
                  onBlur={() => { if (reg.password.length >= 6) setRegErrors(er => ({ ...er, password: "" })); }}
                  placeholder="Придумайте пароль"
                  className={`${inputCls} pr-12 ${regErrors.password ? "border-red-400 ring-1 ring-red-400" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => setShowRegPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                >
                  {showRegPass ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {regErrors.password && <p className="text-xs text-red-500 font-medium">{regErrors.password}</p>}
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-1 rounded-full bg-primary" />
              <div className="flex-1 h-1 rounded-full bg-muted" />
              <span className="text-xs text-muted-foreground">Шаг 1 из 2</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ minHeight: 52 }}
              className="w-full bg-primary text-white font-semibold text-base rounded-xl disabled:opacity-50 transition-opacity active:opacity-80 flex items-center justify-center gap-2"
            >
              Далее — указать цены →
            </button>

            <p className="text-center text-xs text-muted-foreground">
              После регистрации менеджер свяжется с вами
            </p>
          </form>
        )}
        </>
        )}
      </div>
    </div>
  );
}
