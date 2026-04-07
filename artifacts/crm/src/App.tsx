import { Switch, Route, Router as WouterRouter } from "wouter";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => { window.location.replace("/login"); return null; }} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/orders" component={Orders} />
      <Route path="/masters" component={Masters} />
      <Route path="/finance" component={Finance} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={Settings} />
      <Route path="/users" component={Users} />
      {/* Redirect old /voronka URL to unified masters page with kanban view */}
      <Route path="/voronka" component={() => { window.location.replace("/masters?view=kanban"); return null; }} />
      <Route path="/master-chat" component={MasterChatPage} />
      <Route path="/trash" component={TrashPage} />
      <Route path="/tasks" component={TasksPage} />
      <Route path="/dialogs" component={DialogsPage} />
      <Route path="/checkins" component={CheckinsPage} />
      <Route path="/avito" component={AvitoPage} />
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
