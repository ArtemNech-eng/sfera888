import { Switch, Route, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import BottomNav from "@/components/BottomNav";
import AuthPage from "@/pages/auth";
import DashboardPage from "@/pages/dashboard";
import CreateLeadPage from "@/pages/create-lead";
import MyLeadsPage from "@/pages/my-leads";
import PayoutsPage from "@/pages/payouts";
import ProfilePage from "@/pages/profile";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

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

  return (
    <div className="relative">
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/create-lead" component={CreateLeadPage} />
        <Route path="/my-leads" component={MyLeadsPage} />
        <Route path="/payouts" component={PayoutsPage} />
        <Route path="/profile" component={ProfilePage} />
        <Route>
          <Redirect to="/" />
        </Route>
      </Switch>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </QueryClientProvider>
  );
}
