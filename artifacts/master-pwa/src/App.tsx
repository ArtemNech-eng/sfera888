import { Component, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; msg: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, msg: "" };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-dvh gap-4 px-6 text-center">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-lg font-bold text-gray-900">Что-то пошло не так</h1>
          <p className="text-sm text-muted-foreground max-w-xs">Перезагрузите страницу или обратитесь к менеджеру.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
          >
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import BottomNav from "@/components/bottom-nav";
import InstallBanner from "@/components/install-banner";
import LoginPage from "@/pages/login";
import HomePage from "@/pages/home";
import OrdersPage from "@/pages/orders";
import BalancePage from "@/pages/balance";
import ProfilePage from "@/pages/profile";
import ChatPage from "@/pages/chat";
import PendingContractPage from "@/pages/pending-contract";
import { ShieldBan, LogOut } from "lucide-react";
import MaxBotBanner from "@/components/max-bot-banner";

function SuspendedScreen() {
  const { logout } = useAuth();
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh gap-6 px-6 text-center bg-background">
      <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
        <ShieldBan className="w-10 h-10 text-red-500" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-gray-900">Аккаунт заблокирован</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          Ваш аккаунт временно отстранён от работы. Пожалуйста, свяжитесь с менеджером для уточнения деталей.
        </p>
      </div>
      <button
        onClick={logout}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
      >
        <LogOut size={15} />
        Выйти из аккаунта
      </button>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { master, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Not logged in → go to login
  if (!master && location !== "/login") {
    return <Redirect to="/login" />;
  }
  // Logged in + on login page → redirect
  if (master && location === "/login") {
    if (master.status === "suspended") return <SuspendedScreen />;
    const target = master.status === "pending_contract" ? "/pending-contract" : "/";
    return <Redirect to={target} />;
  }
  // Suspended master → show blocked screen regardless of route
  if (master && master.status === "suspended") {
    return <SuspendedScreen />;
  }
  // Logged in but pending contract → only allow /pending-contract
  if (master && master.status === "pending_contract" && location !== "/pending-contract") {
    return <Redirect to="/pending-contract" />;
  }
  // Active master on pending-contract page → redirect home
  if (master && master.status !== "pending_contract" && location === "/pending-contract") {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { master } = useAuth();
  const isPending = master?.status === "pending_contract";
  const isSuspended = master?.status === "suspended";

  return (
    <div className="flex flex-col min-h-dvh">
      {master && !isPending && !isSuspended && <MaxBotBanner />}
      <main className={`flex-1 overflow-auto ${master && !isPending && !isSuspended ? "pb-20" : ""}`}>
        <AuthGuard>
          <Switch>
            <Route path="/login" component={LoginPage} />
            <Route path="/pending-contract" component={PendingContractPage} />
            <Route path="/" component={HomePage} />
            <Route path="/orders" component={OrdersPage} />
            <Route path="/chat" component={ChatPage} />
            <Route path="/balance" component={BalancePage} />
            <Route path="/profile" component={ProfilePage} />
          </Switch>
        </AuthGuard>
      </main>
      {master && !isPending && !isSuspended && <BottomNav />}
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <Toaster position="top-center" richColors />
          <InstallBanner />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
