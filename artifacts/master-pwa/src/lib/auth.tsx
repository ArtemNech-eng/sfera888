import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

interface Master {
  id: number;
  alias: string;
  city: string;
  specialization: string;
  rating: number;
  debt: number;
  phone: string | null;
  status: string;
  customAvatarUrl?: string | null;
  maxChatId?: string | null;
  maxBotLink?: string | null;
}

interface AuthCtx {
  master: Master | null;
  loading: boolean;
  login: (login: string, password: string, maxChatId?: string | null) => Promise<void>;
  register: (data: { alias: string; phone?: string; city: string; specialization: string; specializations?: string[]; login: string; password: string; servicePrices?: { service: string; priceFrom: number }[]; maxChatId?: string | null }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [master, setMaster] = useState<Master | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/master-pwa/auth/me", { credentials: "include" });
      if (res.status === 401) {
        setMaster(null);
        return;
      }
      if (!res.ok) return; // server/network error — keep current session state
      const m = await res.json();
      setMaster(m);
    } catch {
      // network error — keep current session state, don't log out
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const login = async (login: string, password: string, maxChatId?: string | null) => {
    const m = await api.auth.login(login, password, maxChatId);
    setMaster(m);
  };

  const register = async (data: Parameters<typeof api.auth.register>[0]) => {
    const m = await api.auth.register(data);
    setMaster(m);
  };

  const logout = async () => {
    await api.auth.logout();
    setMaster(null);
  };

  return (
    <AuthContext.Provider value={{ master, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
