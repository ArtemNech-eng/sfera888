import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, Loader2, User, MapPin } from "lucide-react";

type Mode = "login" | "register";

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setError("");
    setName("");
    setPhone("");
    setCity("");
    setPassword("");
    setConfirmPassword("");
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    resetForm();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "login") {
      if (!phone.trim() || !password) return;
      setLoading(true);
      try {
        await login(phone.trim(), password);
      } catch (err: any) {
        setError(err.message ?? "Неверный номер или пароль");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Register
    if (!name.trim() || !phone.trim() || !city.trim() || !password) {
      setError("Заполните все поля");
      return;
    }
    if (password.length < 6) {
      setError("Пароль должен быть не менее 6 символов");
      return;
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);
    try {
      await register(name.trim(), phone.trim(), city.trim(), password);
    } catch (err: any) {
      setError(err.message ?? "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="min-h-dvh flex flex-col bg-[#F8F9FA]">
      <div className="flex-1 flex flex-col justify-center px-6 py-12 max-w-md mx-auto w-full">
        <div className="mb-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#34C759] flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#111827]">Сфера Партнёр</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            {isLogin ? "Войдите в личный кабинет" : "Создайте аккаунт партнёра"}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-white border border-[#E5E7EB] p-1 mb-6">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              isLogin ? "bg-[#34C759] text-white" : "text-[#6B7280] hover:text-[#111827]"
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              !isLogin ? "bg-[#34C759] text-white" : "text-[#6B7280] hover:text-[#111827]"
            }`}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#374151]">Имя</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={18} />
                <input
                  type="text"
                  placeholder="Ваше имя"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(""); }}
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base"
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#374151]">Номер телефона</label>
            <input
              type="tel"
              placeholder="+7 (___) ___-__-__"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError(""); }}
              className="w-full px-4 py-3.5 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base"
              autoComplete="tel"
              inputMode="tel"
            />
          </div>

          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#374151]">Город</label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={18} />
                <input
                  type="text"
                  placeholder="Москва"
                  value={city}
                  onChange={e => { setCity(e.target.value); setError(""); }}
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base"
                  autoComplete="address-level2"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#374151]">Пароль</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                placeholder={isLogin ? "Введите пароль" : "Придумайте пароль"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                className="w-full px-4 py-3.5 pr-12 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base"
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPwd(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[#9CA3AF]"
              >
                {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {!isLogin && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#374151]">Повторите пароль</label>
              <input
                type={showPwd ? "text" : "password"}
                placeholder="Повторите пароль"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setError(""); }}
                className="w-full px-4 py-3.5 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !phone.trim() || !password || (!isLogin && (!name.trim() || !city.trim() || !confirmPassword))}
            className="w-full h-[52px] rounded-xl bg-[#34C759] text-white font-semibold text-base disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : isLogin ? "Войти" : "Зарегистрироваться"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-[#9CA3AF]">
          {isLogin
            ? "Нет аккаунта? Выберите «Регистрация» выше"
            : "Уже есть аккаунт? Выберите «Вход» выше"}
        </p>
      </div>
    </div>
  );
}
