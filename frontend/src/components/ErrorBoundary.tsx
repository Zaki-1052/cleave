// frontend/src/components/ErrorBoundary.tsx
import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-100 via-emerald-50 to-amber-50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-card p-8 shadow-lg">
            <h1 className="mb-2 text-xl font-bold text-foreground">Something went wrong</h1>
            <p className="mb-4 text-sm text-muted-foreground">
              An unexpected error occurred. You can try again or return to the home page.
            </p>
            {this.state.error && (
              <pre className="mb-4 max-h-32 overflow-auto rounded bg-red-50 dark:bg-red-950 p-3 font-mono text-xs text-red-700 dark:text-red-300">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
              >
                Try Again
              </button>
              <a
                href="/"
                className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Return to Home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
