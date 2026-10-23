// Shows a readable message instead of a blank screen when part of the app
// crashes, with the details a trainee can screenshot and send in.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Where the crash happened, shown in the message ("the building view"). */
  area?: string;
  /** Compact panel for a part of the screen instead of the whole page. */
  inline?: boolean;
  onReset?: () => void;
}

interface State {
  error: Error | null;
  stack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FIRST FIVE crashed', error, info.componentStack);
    this.setState({ stack: (info.componentStack ?? '').trim().split('\n').slice(0, 6).join('\n') });
  }

  reset = () => {
    this.setState({ error: null, stack: '' });
    this.props.onReset?.();
  };

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const details = `${error.name}: ${error.message}\n${stack}\n${navigator.userAgent}`;
    return (
      <div role="alert" className={`overflow-auto bg-ink-950 text-ink-100 ${this.props.inline ? 'h-full p-4' : 'h-full p-6'}`}>
        <div className="mx-auto max-w-2xl space-y-3">
          <h2 className="text-lg font-bold text-signal-red">Something went wrong{this.props.area ? ` in ${this.props.area}` : ''}.</h2>
          <p className="text-sm text-ink-300">
            The rest of the app is still running. Try again, or go back to the start. If it keeps happening, take a screenshot of this box and send it in.
          </p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-ink-700 bg-ink-900 p-2 text-xs text-ink-300">{details}</pre>
          <div className="flex flex-wrap gap-2">
            <button className="rounded bg-signal-amber px-3 py-1.5 text-sm font-semibold text-ink-950" onClick={this.reset}>
              Try again
            </button>
            <button className="rounded border border-ink-600 px-3 py-1.5 text-sm" onClick={() => location.reload()}>
              Reload the page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
