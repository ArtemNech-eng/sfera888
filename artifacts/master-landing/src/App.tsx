import { Router, Route, Switch } from 'wouter';
import LegacyLanding from './components/LegacyLanding.tsx';
import HonestLanding from './components/honest/HonestLanding.tsx';

export default function App() {
  console.log('App mounted, BASE_URL:', import.meta.env.BASE_URL);
  return (
    <Router base={import.meta.env.BASE_URL || '/'}>
      <Switch>
        <Route path="/" component={LegacyLanding} />
        <Route path="/honest" component={HonestLanding} />
        <Route>404 - Not Found</Route>
      </Switch>
    </Router>
  );
}
