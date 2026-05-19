import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { useEffect, Component, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
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

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Leads from "@/pages/leads";
import Orders from "@/pages/orders";
import Masters from "@/pages/masters";
import Finance from "@/pages/finance";
import Analytics from "@/pages/analytics";
import Settings from "@/pages/settings";
import Users from "@/pages/users";
import MasterChatPage from "@/pages/master-chat";
import TrashPage from "@/pages/trash";
import TasksPage from "@/pages/tasks";
import DialogsPage from "@/pages/dialogs";
import CheckinsPage from "@/pages/checkins";
import AvitoPage from "@/pages/avito";
import AvitoMessagesPage from "@/pages/avito-messages";
import AiOfficePage from "@/pages/ai-office";
import MasterControlPage from "@/pages/master-control";
import ScoreDistributionPage from "@/pages/score-distribution";
import NotFound from "@/pages/not-found";
import TokenSettingsPage from "@/pages/token-settings";
import TokenRefundsPage from "@/pages/token-refunds";
import TokenPurchasesPage from "@/pages/token-purchases";
import PartnersPage from "@/pages/partners";
import PartnerLeadsReviewPage from "@/pages/partner-leads-review";
import PartnerAnalyticsPage from "@/pages/partner-analytics";
import TokenMastersPage from "@/pages/token-masters";

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
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={RootRedirect} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/orders" component={() => <InAppRedirect to="/leads?tab=work" />} />
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
      <Route path="/master-control" component={MasterControlPage} />
      <Route path="/token-settings" component={TokenSettingsPage} />
      <Route path="/token-refunds" component={TokenRefundsPage} />
      <Route path="/token-purchases" component={TokenPurchasesPage} />
      <Route path="/token-masters" component={TokenMastersPage} />
      <Route path="/partners" component={PartnersPage} />
      <Route path="/partner-leads-review" component={PartnerLeadsReviewPage} />
      <Route path="/partner-analytics" component={PartnerAnalyticsPage} />
      <Route path="/work-monitor">{() => <Redirect to="/leads?tab=work" />}</Route>
      <Route component={NotFound} />
    </Switch>
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
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
