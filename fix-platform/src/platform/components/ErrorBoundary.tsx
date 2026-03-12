/**
 * ErrorBoundary — React error boundary with retry button.
 *
 * PURPOSE:
 * Catches render errors from child components and displays a friendly
 * error message with a retry button that resets the boundary state.
 *
 * USAGE:
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // Custom fallback message:
 * <ErrorBoundary message="Failed to load services">
 *   <ServicesPanel />
 * </ErrorBoundary>
 * ```
 *
 * GOTCHAS:
 * - Must be a class component — React error boundaries require lifecycle methods
 * - Uses all-longhand CSS properties (no shorthand mixing)
 */
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom message shown in the error UI */
  message?: string;
  /** Optional fallback UI override */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console for debugging — in production, send to error tracking
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, message, fallback } = this.props;

    if (!hasError) return children;

    if (fallback) return fallback;

    return (
      <div style={styles.container} role="alert">
        <div style={styles.icon}>!</div>
        <p style={styles.message}>
          {message ?? 'Something went wrong. Please try again.'}
        </p>
        {error && (
          <p style={styles.detail}>{error.message}</p>
        )}
        <button
          style={styles.retryBtn}
          onClick={this.handleRetry}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    textAlign: 'center',
    color: '#333',
  },
  icon: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: '#ffebee',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#c62828',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '22px',
    fontWeight: 700,
    color: '#c62828',
    marginBottom: '16px',
  },
  message: {
    fontSize: '15px',
    color: '#333',
    margin: '0 0 8px',
    fontWeight: 500,
  },
  detail: {
    fontSize: '12px',
    color: '#888',
    margin: '0 0 20px',
    fontFamily: 'monospace',
    maxWidth: '400px',
    wordBreak: 'break-word',
  },
  retryBtn: {
    background: '#1a5c5a',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#164f4d',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 500,
    padding: '8px 20px',
    cursor: 'pointer',
  },
};
