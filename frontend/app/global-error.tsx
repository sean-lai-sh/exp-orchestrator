'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error', { digest: error.digest, error });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          padding: '24px',
          background: '#fafafa',
          color: '#222',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '20px', fontWeight: 600 }}>The app crashed</h1>
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
          Reload
        </button>
      </body>
    </html>
  );
}
