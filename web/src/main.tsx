import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './routes/App';
import './styles/tailwind.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

if ('serviceWorker' in navigator) {
  try {
    const register = registerSW as (options?: { immediate?: boolean }) => void;
    register({ immediate: true });
  } catch (error) {
    console.error('Failed to register service worker', error);
  }
}
