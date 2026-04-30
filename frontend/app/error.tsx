'use client';

import { useEffect } from 'react';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error', { digest: error.digest, error });
  }, [error]);

  return (
    <div
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '24px',
        background: 'var(--paper, #fafafa)',
        color: 'var(--ink, #222)',
        fontFamily: 'var(--font-inter-tight), system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '20px', fontWeight: 600 }}>Something went wrong</h1>
      <p style={{ fontSize: '14px', opacity: 0.8, maxWidth: '480px', textAlign: 'center' }}>
        {error.message || 'An unexpected error occurred.'}
      </p>
      <button
        onClick={reset}
        style={{
          padding: '8px 16px',
          border: '1px solid currentColor',
          borderRadius: '4px',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        Try again
      </button>
    </div>
  );
}
