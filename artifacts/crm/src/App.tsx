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
import Voronka from "@/pages/voronka";
import MasterChatPage from "@/pages/master-chat";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Dashboard} />
      <Route path="/leads" component={Leads} />
      <Route path="/orders" component={Orders} />
      <Route path="/masters" component={Masters} />
      <Route path="/finance" component={Finance} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/settings" component={Settings} />
      <Route path="/users" component={Users} />
      <Route path="/voronka" component={Voronka} />
      <Route path="/master-chat" component={MasterChatPage} />
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
