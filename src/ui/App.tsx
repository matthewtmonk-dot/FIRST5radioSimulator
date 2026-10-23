import { lazy, Suspense, useEffect } from 'react';
import { useSession, type Screen } from '../store/session';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Exercise } from './screens/exercise/Exercise';
import { Gallery } from './screens/Gallery';
import { Home } from './screens/Home';
import { Review } from './screens/Review';

const History = lazy(() => import('./screens/History').then((m) => ({ default: m.History })));
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })));
const Help = lazy(() => import('./screens/Help').then((m) => ({ default: m.Help })));
const Builder = lazy(() => import('./screens/builder/Builder').then((m) => ({ default: m.Builder })));

const NAV: { id: Screen; label: string }[] = [
  { id: 'home', label: 'Train' },
  { id: 'history', label: 'History' },
  { id: 'builder', label: 'Scenario Builder' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
];

export function App() {
  const screen = useSession((s) => s.screen);
  const nav = useSession((s) => s.nav);
  const inExercise = useSession((s) => s.screen === 'exercise' && !!s.sim && !s.sim.ended);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (useSession.getState().screen === 'exercise' && !useSession.getState().sim?.ended) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  if (new URLSearchParams(location.search).has('gallery')) return <Gallery />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-1 border-b border-ink-700 bg-ink-950 px-3">
        <button onClick={() => !inExercise && nav('home')} className="mr-3 py-2.5 text-sm font-black tracking-tight" aria-label="FIRST FIVE home">
          FIRST <span className="text-signal-red">FIVE</span>
        </button>
        <nav className="scroll-thin flex min-w-0 flex-1 gap-0.5 overflow-x-auto" aria-label="Main">
          {!inExercise &&
            NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => nav(n.id)}
                aria-current={screen === n.id ? 'page' : undefined}
                className={`whitespace-nowrap rounded px-2.5 py-1.5 text-sm ${screen === n.id ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-100'}`}
              >
                {n.label}
              </button>
            ))}
          {inExercise && <span className="py-2.5 text-xs text-ink-400">Exercise in progress — use End to leave.</span>}
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <ErrorBoundary key={screen}>
          <Suspense fallback={<div className="p-6 text-ink-400">Loading…</div>}>
            {screen === 'home' && <Home />}
            {screen === 'exercise' && <Exercise />}
            {screen === 'review' && <Review />}
            {screen === 'history' && <History />}
            {screen === 'settings' && <Settings />}
            {screen === 'help' && <Help />}
            {screen === 'builder' && <Builder />}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
