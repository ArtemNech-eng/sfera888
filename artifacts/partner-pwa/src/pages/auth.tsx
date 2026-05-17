import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function AuthPage() {
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      await login(phone.trim(), password);
    } catch (err: any) {
      setError(err.message ?? "Неверный номер или пароль");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[#F8F9FA]">
      <div className="flex-1 flex flex-col justify-center px-6 py-12 max-w-md mx-auto w-full">
        <div className="mb-10 text-center">
          <div className="w-16 h-16 rounded-2xl bg-[#34C759] flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#111827]">Сфера Партнёр</h1>
          <p className="text-sm text-[#6B7280] mt-1">Войдите в личный кабинет</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#374151]">Пароль</label>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                placeholder="Введите пароль"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                className="w-full px-4 py-3.5 pr-12 rounded-xl border border-[#E5E7EB] bg-white text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#34C759] focus:border-transparent text-base"
                autoComplete="current-password"
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

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !phone.trim() || !password}
            className="w-full h-[52px] rounded-xl bg-[#34C759] text-white font-semibold text-base disabled:opacity-50 flex items-center justify-center gap-2 transition-opacity"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : "Войти"}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-[#9CA3AF]">
          Доступ предоставляется менеджером Сферы
        </p>
      </div>
    </div>
  );
}
