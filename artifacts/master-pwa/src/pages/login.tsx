import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Eye, EyeOff, HardHat } from "lucide-react";

const CITIES = [
  "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург",
  "Казань", "Нижний Новгород", "Челябинск", "Самара",
  "Краснодар", "Ростов-на-Дону", "Другой город",
];

const SPECS = [
  "Укладка плитки",
  "Поклейка обоев",
  "Покраска стен",
  "Монтаж ламината",
  "Штукатурка стен",
  "Электромонтаж",
  "Сантехника",
  "Натяжные потолки",
  "Комплексный ремонт",
];

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return "7" + digits;
  if (digits.length === 11 && digits[0] === "8") return "7" + digits.slice(1);
  if (digits.length === 11 && digits[0] === "7") return digits;
  return digits;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full h-12 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");

  const [form, setForm] = useState({ login: "", password: "" });
  const [showPass, setShowPass] = useState(false);

  const [reg, setReg] = useState({
    alias: "",
    phone: "",
    city: "",
    specs: [] as string[],
    password: "",
  });
  const [showRegPass, setShowRegPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.login || !form.password) { toast.error("Введите логин и пароль"); return; }
    setLoading(true);
    try {
      await login(form.login, form.password);
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reg.alias.trim()) { toast.error("Введите имя/псевдоним"); return; }
    const phoneNorm = normalizePhone(reg.phone);
    if (phoneNorm.length < 10 || phoneNorm.length > 11) {
      toast.error("Введите корректный номер телефона");
      return;
    }
    if (!reg.city) { toast.error("Выберите город"); return; }
    if (reg.specs.length === 0) { toast.error("Выберите хотя бы одну специальность"); return; }
    if (reg.password.length < 6) { toast.error("Пароль минимум 6 символов"); return; }
    setLoading(true);
    try {
      await register({
        alias: reg.alias.trim(),
        phone: "+" + phoneNorm,
        city: reg.city,
        specialization: reg.specs.join(", "),
        specializations: reg.specs,
        login: phoneNorm,
        password: reg.password,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  const toggleSpec = (spec: string) => {
    setReg(r => ({
      ...r,
      specs: r.specs.includes(spec)
        ? r.specs.filter(s => s !== spec)
        : [...r.specs, spec],
    }));
  };

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

        {/* Tabs */}
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

        {tab === "login" ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <Field label="Номер телефона / логин">
              <input
                type="text"
                autoComplete="username"
                value={form.login}
                onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
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

            <p className="text-center text-xs text-muted-foreground">
              Обратитесь к менеджеру, если нет аккаунта
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <Field label="Имя / псевдоним *">
              <input
                type="text"
                autoComplete="name"
                value={reg.alias}
                onChange={e => setReg(r => ({ ...r, alias: e.target.value }))}
                placeholder="Например: Иван М."
                className={inputCls}
              />
            </Field>

            <Field label="Номер телефона * (используется как логин)">
              <input
                type="tel"
                autoComplete="tel"
                value={reg.phone}
                onChange={e => setReg(r => ({ ...r, phone: e.target.value }))}
                placeholder="+7 (___) ___-__-__"
                className={inputCls}
              />
            </Field>

            <Field label="Город *">
              <select
                value={reg.city}
                onChange={e => setReg(r => ({ ...r, city: e.target.value }))}
                className={`${inputCls} appearance-none`}
              >
                <option value="">Выберите город</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>

            <Field label="Специальности * (можно несколько)">
              <div className="flex flex-wrap gap-2 pt-0.5">
                {SPECS.map(spec => {
                  const active = reg.specs.includes(spec);
                  return (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => toggleSpec(spec)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                        active
                          ? "bg-primary text-white border-primary shadow-sm"
                          : "bg-card text-muted-foreground border-input hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      {spec}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Пароль * (мин. 6 символов)">
              <div className="relative">
                <input
                  type={showRegPass ? "text" : "password"}
                  autoComplete="new-password"
                  value={reg.password}
                  onChange={e => setReg(r => ({ ...r, password: e.target.value }))}
                  placeholder="Придумайте пароль"
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowRegPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
                >
                  {showRegPass ? <EyeOff size={20} /> : <Eye size={20} />}
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
                : "Зарегистрироваться"}
            </button>

            <p className="text-center text-xs text-muted-foreground">
              После регистрации менеджер свяжется с вами
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
