import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useEffect, Component, ReactNode, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", background: "#fff1f0", minHeight: "100vh" }}>
          <h2 style={{ color: "#cf1322", marginBottom: 12 }}>Ошибка рендера</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 13, color: "#333" }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 20, padding: "8px 20px", background: "#cf1322", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Pages (eager)
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

// Pages (lazy)
const Leads = lazy(() => import("@/pages/leads"));
const Orders = lazy(() => import("@/pages/orders"));
const Masters = lazy(() => import("@/pages/masters"));
const Finance = lazy(() => import("@/pages/finance"));
const Analytics = lazy(() => import("@/pages/analytics"));
const ScoreDistributionPage = lazy(() => import("@/pages/score-distribution"));
const Settings = lazy(() => import("@/pages/settings"));
const Users = lazy(() => import("@/pages/users"));
const MasterChatPage = lazy(() => import("@/pages/master-chat"));
const TrashPage = lazy(() => import("@/pages/trash"));
const TasksPage = lazy(() => import("@/pages/tasks"));
const DialogsPage = lazy(() => import("@/pages/dialogs"));
const CheckinsPage = lazy(() => import("@/pages/checkins"));
const AvitoPage = lazy(() => import("@/pages/avito"));
const AvitoMessagesPage = lazy(() => import("@/pages/avito-messages"));
const AiOfficePage = lazy(() => import("@/pages/ai-office"));
const PartnersPage = lazy(() => import("@/pages/partners"));
const PartnerLeadsReviewPage = lazy(() => import("@/pages/partner-leads-review"));
const PartnerAnalyticsPage = lazy(() => import("@/pages/partner-analytics"));

const queryClient = new QueryClient();

function InAppRedirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [to]);
  return null;
}

function RootRedirect() {
  const params = new URLSearchParams(window.location.search);
  const avitoConnected = params.get("avito_connected");
  const avitoError = params.get("avito_error");
  if (avitoConnected) return <InAppRedirect to={`/avito?avito_connected=1`} />;
  if (avitoError) return <InAppRedirect to={`/avito?avito_error=${encodeURIComponent(avitoError)}`} />;
  return <InAppRedirect to="/dashboard" />;
}

function Router() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen text-sm text-gray-500">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-700 mr-3" />
        Загрузка…
      </div>
    }>
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={RootRedirect} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/orders" component={Orders} />
      <Route path="/masters" component={Masters} />
      <Route path="/finance" component={Finance} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/analytics/score-distribution" component={ScoreDistributionPage} />
      <Route path="/settings" component={Settings} />
      <Route path="/users" component={Users} />
      {/* Redirect old /voronka URL to unified masters page with kanban view */}
      <Route path="/voronka" component={() => <InAppRedirect to="/masters?view=kanban" />} />
      <Route path="/master-chat" component={MasterChatPage} />
      <Route path="/trash" component={TrashPage} />
      <Route path="/tasks" component={TasksPage} />
      <Route path="/dialogs" component={DialogsPage} />
      <Route path="/checkins" component={CheckinsPage} />
      <Route path="/avito" component={AvitoPage} />
      <Route path="/avito-messages" component={AvitoMessagesPage} />
      <Route path="/ai-office" component={AiOfficePage} />
      <Route path="/partners" component={PartnersPage} />
      <Route path="/partner-leads-review" component={PartnerLeadsReviewPage} />
      <Route path="/partner-analytics" component={PartnerAnalyticsPage} />
      <Route path="/work-monitor">{() => <Redirect to="/leads?tab=work" />}</Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
          <Sonner richColors position="top-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
