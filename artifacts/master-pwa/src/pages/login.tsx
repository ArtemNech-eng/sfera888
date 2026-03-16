import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Eye, EyeOff, Wrench } from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ login: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.login || !form.password) {
      toast.error("Введите логин и пароль");
      return;
    }
    setLoading(true);
    try {
      await login(form.login, form.password);
    } catch (err: any) {
      toast.error(err.message ?? "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 bg-background">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mx-auto mb-4">
            <Wrench className="text-white" size={32} />
          </div>
          <h1 className="text-2xl font-bold">МастерApp</h1>
          <p className="text-muted-foreground text-sm">Войдите в аккаунт</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Логин</label>
            <input
              type="text"
              autoComplete="username"
              value={form.login}
              onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
              placeholder="Ваш логин"
              className="w-full h-12 px-4 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Пароль</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Ваш пароль"
                className="w-full h-12 px-4 pr-12 rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground p-1"
              >
                {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-13 bg-primary text-white font-semibold text-base rounded-xl disabled:opacity-50 transition-opacity active:opacity-80 flex items-center justify-center gap-2"
            style={{ minHeight: 52 }}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              "Войти"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Обратитесь к менеджеру для получения доступа
        </p>
      </div>
    </div>
  );
}
