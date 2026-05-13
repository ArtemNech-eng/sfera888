import { Router, Route, Switch } from 'wouter';
import LegacyLanding from './components/LegacyLanding.tsx';
import HonestLanding from './components/honest/HonestLanding.tsx';

export default function App() {
  console.log('App mounted, BASE_URL:', import.meta.env.BASE_URL);
  return (
    <Router base={import.meta.env.BASE_URL || '/'}>
      <Switch>
        <Route path="/">
          {(params) => {
            console.log('Route / matched, redirecting');
            return <LegacyLanding />;
          }}
        </Route>
        <Route path="/honest">
          {(params) => {
            console.log('Route /honest matched, rendering HonestLanding');
            return <HonestLanding />;
          }}
        </Route>
        <Route>
          {(params) => {
            console.log('404 route matched');
            return <div>404 - Not Found</div>;
          }}
        </Route>
      </Switch>
    </Router>
  );
}
