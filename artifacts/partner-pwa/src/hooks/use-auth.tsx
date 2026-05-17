import React, { createContext, useContext, useEffect, useState } from "react";
import { authApi, type Partner } from "@/lib/api";

interface AuthCtx {
  partner: Partner | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (name: string, phone: string, city: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.me()
      .then(setPartner)
      .catch(() => setPartner(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (phone: string, password: string) => {
    const p = await authApi.login(phone, password);
    setPartner(p);
  };

  const register = async (name: string, phone: string, city: string, password: string) => {
    const p = await authApi.register({ name, phone, city, password });
    setPartner(p);
  };

  const logout = async () => {
    await authApi.logout();
    setPartner(null);
  };

  return (
    <AuthContext.Provider value={{ partner, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
