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
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 shadow-sm">
            <h1 className="mb-2 font-display text-xl font-semibold text-foreground">Something went wrong</h1>
            <p className="mb-4 text-sm text-muted-foreground">
              An unexpected error occurred. You can try again or return to the home page.
            </p>
            {this.state.error && (
              <pre className="mb-4 max-h-32 overflow-auto rounded-md border border-destructive/20 bg-destructive/10 p-3 font-mono text-xs text-destructive">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Try Again
              </button>
              <a
                href="/"
                className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
