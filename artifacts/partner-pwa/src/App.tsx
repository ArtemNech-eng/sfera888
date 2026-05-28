import { Router, Switch, Route, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import BottomNav from "@/components/BottomNav";
import InstallBanner from "@/components/InstallBanner";
import AuthPage from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import CreateLeadPage from "@/pages/create-lead";
import MyLeadsPage from "@/pages/my-leads";
import LeadDetailPage from "@/pages/lead-detail";
import PayoutsPage from "@/pages/payouts";
import ProfilePage from "@/pages/profile";
import { Clock } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function PendingScreen() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#F8F9FA] px-6 text-center">
      <div className="w-20 h-20 rounded-full bg-[#FEF3C7] flex items-center justify-center mb-6">
        <Clock className="w-10 h-10 text-[#D97706]" />
      </div>
      <h2 className="text-xl font-bold text-[#111827] mb-2">Заявка на рассмотрении</h2>
      <p className="text-[#6B7280] text-sm max-w-xs">
        Ваш аккаунт создан и ожидает подтверждения менеджера. Обычно это занимает до 24 часов.
      </p>
    </div>
  );
}

function AppRoutes() {
  const { partner, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-[#F8F9FA]">
        <div className="w-8 h-8 rounded-full border-4 border-[#34C759] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!partner) {
    return <AuthPage />;
  }

  if (partner.status === "pending") {
    return <PendingScreen />;
  }

  const base = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL?.replace(/\/$/, "");

  return (
    <div className="relative">
      <Router base={base}>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/create-lead" component={CreateLeadPage} />
          <Route path="/my-leads" component={MyLeadsPage} />
          <Route path="/leads/:id" component={LeadDetailPage} />
          <Route path="/payouts" component={PayoutsPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route>
            <Redirect to="/" />
          </Route>
        </Switch>
        <BottomNav />
      </Router>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
        <InstallBanner />
      </AuthProvider>
    </QueryClientProvider>
  );
}
