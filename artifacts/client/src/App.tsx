import { Switch, Route, Router as WouterRouter } from "wouter";
import Smeta from "@/pages/Smeta";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/smeta/:token" component={Smeta} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}
