import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";

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
import AiOfficePage from "@/pages/ai-office";
import NotFound from "@/pages/not-found";

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
      <Route path="/orders" component={Orders} />
      <Route path="/masters" component={Masters} />
      <Route path="/finance" component={Finance} />
      <Route path="/analytics" component={Analytics} />
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
      <Route path="/ai-office" component={AiOfficePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
