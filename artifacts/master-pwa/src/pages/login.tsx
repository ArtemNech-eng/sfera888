import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Eye, EyeOff, Zap } from "lucide-react";

const CITIES = ["Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань", "Нижний Новгород", "Челябинск", "Самара", "Краснодар", "Ростов-на-Дону", "Другой город"];
const SPECS = ["Ремонт бытовой техники", "Холодильники", "Стиральные машины", "Плиты и духовки", "Кондиционеры", "Посудомоечные машины", "Телевизоры", "Другое"];

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

  // login form
  const [form, setForm] = useState({ login: "", password: "" });
  const [showPass, setShowPass] = useState(false);

  // register form
  const [reg, setReg] = useState({ alias: "", phone: "", city: "", specialization: "", login: "", password: "" });
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
    if (!reg.city) { toast.error("Выберите город"); return; }
    if (!reg.specialization) { toast.error("Выберите специализацию"); return; }
    if (!reg.login.trim()) { toast.error("Введите логин"); return; }
    if (reg.password.length < 6) { toast.error("Пароль минимум 6 символов"); return; }
    setLoading(true);
    try {
      await register({
        alias: reg.alias.trim(),
        phone: reg.phone.trim() || undefined,
        city: reg.city,
        specialization: reg.specialization,
        login: reg.login.trim(),
        password: reg.password,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10 bg-background relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full blur-[120px] opacity-20"
           style={{ background: "radial-gradient(ellipse, #7C3AED 0%, #4F46E5 60%, transparent 100%)" }} />
      <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full blur-[100px] opacity-10"
           style={{ background: "#6366F1" }} />

      <div className="w-full max-w-sm space-y-7 relative z-10">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl mx-auto mb-4"
               style={{ background: "linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)", boxShadow: "0 8px 32px rgba(124,58,237,0.4)" }}>
            <Zap className="text-white" size={30} fill="white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">МастерApp</h1>
          <p className="text-sm text-muted-foreground">Платформа для мастеров</p>
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
            <Field label="Логин">
              <input
                type="text"
                autoComplete="username"
                value={form.login}
                onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
                placeholder="Ваш логин"
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

            <Field label="Телефон">
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

            <Field label="Специализация *">
              <select
                value={reg.specialization}
                onChange={e => setReg(r => ({ ...r, specialization: e.target.value }))}
                className={`${inputCls} appearance-none`}
              >
                <option value="">Выберите специализацию</option>
                {SPECS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Придумайте логин *">
              <input
                type="text"
                autoComplete="username"
                value={reg.login}
                onChange={e => setReg(r => ({ ...r, login: e.target.value }))}
                placeholder="Только латиница и цифры"
                className={inputCls}
              />
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
