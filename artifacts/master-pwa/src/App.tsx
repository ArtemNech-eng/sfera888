import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import BottomNav from "@/components/bottom-nav";
import LoginPage from "@/pages/login";
import HomePage from "@/pages/home";
import OrdersPage from "@/pages/orders";
import BalancePage from "@/pages/balance";
import ProfilePage from "@/pages/profile";
import ChatPage from "@/pages/chat";
import PendingContractPage from "@/pages/pending-contract";

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
    const target = master.status === "pending_contract" ? "/pending-contract" : "/";
    return <Redirect to={target} />;
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

  return (
    <div className="flex flex-col min-h-dvh">
      <main className={`flex-1 overflow-auto ${master && !isPending ? "pb-20" : ""}`}>
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
      {master && !isPending && <BottomNav />}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRoutes />
        </WouterRouter>
        <Toaster position="top-center" richColors />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
