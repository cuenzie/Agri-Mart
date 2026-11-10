import React from 'react';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Agri-Mart could not find its root element.');
}

const root = createRoot(container);

void import('./App')
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error('Unable to start Agri-Mart:', error);

    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? error.code
        : undefined;
    const invalidApiKey = errorCode === 'auth/invalid-api-key';

    root.render(
      <main
        role="alert"
        style={{
          minHeight: '100vh',
          boxSizing: 'border-box',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#f4f6f8',
          color: '#172b4d',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <section
          style={{
            width: 'min(100%, 560px)',
            boxSizing: 'border-box',
            padding: '32px',
            border: '1px solid #e1e6eb',
            borderRadius: '16px',
            background: '#fff',
            boxShadow: '0 12px 32px rgb(23 43 77 / 10%)',
          }}
        >
          <h1 style={{ margin: '0 0 12px', fontSize: '1.5rem' }}>
            Agri-Mart could not start
          </h1>
          <p style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
            {invalidApiKey
              ? 'Firebase rejected the API key configured for this deployment.'
              : 'An application startup error prevented Agri-Mart from loading.'}
          </p>
          <p style={{ margin: '0 0 24px', lineHeight: 1.6 }}>
            {invalidApiKey
              ? 'In Netlify, set VITE_FIREBASE_API_KEY to the Web API key from Firebase Console > Project settings > Your apps, then trigger a new deploy.'
              : 'Check the deployment configuration and build logs, then reload the page.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: '44px',
              padding: '0 20px',
              border: 0,
              borderRadius: '8px',
              background: '#f47b20',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </section>
      </main>,
    );
  });