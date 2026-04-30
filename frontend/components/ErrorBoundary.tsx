'use client';

import React from 'react';

type Props = {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
  label?: string;
};

type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const label = this.props.label ?? 'ErrorBoundary';
    console.error('ErrorBoundary caught error', { label, error, componentStack: info.componentStack });
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div
        role="alert"
        style={{
          padding: '24px',
          margin: '16px',
          border: '1px solid var(--ink, #222)',
          borderRadius: '6px',
          background: 'var(--paper, #fafafa)',
          color: 'var(--ink, #222)',
          fontFamily: 'var(--font-inter-tight), system-ui, sans-serif',
        }}
      >
        <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>
          Something went wrong
        </h2>
        <p style={{ fontSize: '14px', opacity: 0.8, marginBottom: '12px' }}>
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          onClick={this.reset}
          style={{
            padding: '6px 14px',
            border: '1px solid currentColor',
            borderRadius: '4px',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
