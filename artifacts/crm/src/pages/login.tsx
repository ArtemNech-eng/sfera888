import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, PERM_TO_ROUTE } from "@/hooks/use-auth";
import { Loader2, Lock, User } from "lucide-react";

function getRedirectPath(user: any): string {
  if (user.role === "admin") return "/dashboard";
  const perms: string[] = user.permissions ?? [];
  for (const p of perms) {
    if (PERM_TO_ROUTE[p]) return PERM_TO_ROUTE[p];
  }
  return "/no-access";
}

export default function Login() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [_, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const loginMutation = useLogin({
    mutation: {
      onSuccess: async (data) => {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation(getRedirectPath(data.user));
      },
      onError: () => {
        setError("Неверный логин или пароль");
      }
    }
  });

  if (!isLoading && user) {
    setLocation(getRedirectPath(user));
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!login || !password) {
      setError("Пожалуйста, заполните все поля");
      return;
    }
    loginMutation.mutate({ data: { login, password } });
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      <img 
        src={`${import.meta.env.BASE_URL}images/login-bg.png`} 
        alt="Background gradient" 
        className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-multiply pointer-events-none"
      />
      
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="bg-card/80 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl shadow-primary/10">
          <div className="text-center mb-8">
            <div className="h-14 w-14 bg-primary mx-auto rounded-2xl flex items-center justify-center text-primary-foreground font-display font-bold text-3xl mb-4 shadow-lg shadow-primary/30">
              R
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground">RepairCRM</h1>
            <p className="text-muted-foreground mt-2">Войдите в систему для начала работы</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground ml-1">Логин</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 h-5 w-5 text-muted-foreground" />
                <input 
                  type="text"
                  value={login}
                  onChange={e => setLogin(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground"
                  placeholder="admin"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground ml-1">Пароль</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-5 w-5 text-muted-foreground" />
                <input 
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-foreground"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full mt-2 bg-gradient-to-r from-primary to-primary/90 hover:to-primary text-primary-foreground py-3.5 rounded-xl font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loginMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Войти"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
