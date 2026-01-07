'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: '20px',
            backgroundColor: '#1f2937',
            color: '#f87171',
            minHeight: '100vh',
            fontFamily: 'monospace',
          }}
        >
          <h1 style={{ marginBottom: '10px' }}>Something went wrong</h1>
          <p style={{ marginBottom: '10px', color: '#9ca3af' }}>
            Error details (for debugging):
          </p>
          <pre
            style={{
              backgroundColor: '#111827',
              padding: '15px',
              borderRadius: '8px',
              overflow: 'auto',
              fontSize: '12px',
            }}
          >
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={function () {
              window.location.reload();
            }}
            style={{
              marginTop: '20px',
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
