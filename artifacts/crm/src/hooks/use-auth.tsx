import { createContext, useContext, ReactNode, useEffect } from "react";
import { useGetCurrentUser, User, useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldOff } from "lucide-react";

export const PERM_TO_ROUTE: Record<string, string> = {
  dashboard:    "/",
  voronka:      "/voronka",
  "master-chat": "/master-chat",
  leads:        "/leads",
  orders:       "/orders",
  masters:      "/masters",
  tasks:        "/tasks",
  finance:      "/finance",
  analytics:    "/analytics",
  trash:        "/trash",
};

function getFirstPermRoute(user: any): string {
  const perms: string[] = user?.permissions ?? [];
  for (const p of perms) {
    if (PERM_TO_ROUTE[p]) return PERM_TO_ROUTE[p];
  }
  return "/no-access";
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, error } = useGetCurrentUser({
    query: {
      retry: false,
      refetchOnWindowFocus: false,
    }
  });

  const logoutMutation = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      }
    }
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, logout: handleLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function ProtectedRoute({ 
  children, 
  allowedRoles,
  permissionKey,
}: { 
  children: ReactNode; 
  allowedRoles?: string[];
  permissionKey?: string;
}) {
  const { user, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  const hasAccess = (): boolean => {
    if (!user) return false;
    if (user.role === "admin") return true;
    if (allowedRoles && !allowedRoles.includes(user.role)) return false;
    if (permissionKey) {
      const perms: string[] = (user as any).permissions ?? [];
      return perms.includes(permissionKey);
    }
    return true;
  };

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/login");
    } else if (!isLoading && user && allowedRoles && !allowedRoles.includes(user.role) && user.role !== "admin") {
      setLocation(getFirstPermRoute(user));
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  if (!hasAccess()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <ShieldOff className="w-12 h-12 text-muted-foreground mx-auto" />
          <h2 className="text-xl font-display font-bold text-foreground">Нет доступа</h2>
          <p className="text-muted-foreground text-sm">У вас нет прав для просмотра этого раздела.<br/>Обратитесь к администратору.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
