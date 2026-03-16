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
}

interface AuthCtx {
  master: Master | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (data: { alias: string; phone?: string; city: string; specialization: string; specializations?: string[]; login: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [master, setMaster] = useState<Master | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const m = await api.auth.me();
      setMaster(m);
    } catch {
      setMaster(null);
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  const login = async (login: string, password: string) => {
    const m = await api.auth.login(login, password);
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
