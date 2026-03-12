import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../../src/platform/components/ErrorBoundary';

// Suppress console.error output during error boundary tests
const consoleErrorSpy = vi.spyOn(console, 'error');

// A component that throws when instructed
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Test render error');
  return <span>All good</span>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    consoleErrorSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <span>Safe content</span>
      </ErrorBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('catches a render error and shows default message', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
  });

  it('shows a custom message when provided', () => {
    render(
      <ErrorBoundary message="Failed to load panel">
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Failed to load panel')).toBeInTheDocument();
  });

  it('shows the error detail message', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Test render error')).toBeInTheDocument();
  });

  it('renders a retry button', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('resets after clicking retry', () => {
    // We need a stateful wrapper to toggle the bomb
    let setShouldThrow: (v: boolean) => void;

    function Wrapper() {
      const [shouldThrow, set] = (require('react') as typeof import('react')).useState(true);
      setShouldThrow = set;
      return (
        <ErrorBoundary>
          <Bomb shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );
    }

    render(<Wrapper />);
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();

    // Fix the source of the error before clicking Retry
    setShouldThrow!(false);

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback UI</div>}>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom fallback UI')).toBeInTheDocument();
  });

  it('has role="alert" on error container', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
