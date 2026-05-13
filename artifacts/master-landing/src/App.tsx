import { Router, Route, Switch } from 'wouter';
import LegacyLanding from './components/LegacyLanding.tsx';
import HonestLanding from './components/honest/HonestLanding.tsx';

export default function App() {
  return (
    <Router base={import.meta.env.BASE_URL || '/'}>
      <Switch>
        <Route path="/">
          <HonestLanding />
        </Route>
        <Route path="/honest">
          <HonestLanding />
        </Route>
        <Route path="/legacy">
          <LegacyLanding />
        </Route>
        <Route>
          <HonestLanding />
        </Route>
      </Switch>
    </Router>
  );
}
