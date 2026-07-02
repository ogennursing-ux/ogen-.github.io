import './lib/polyfills.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// The social-worker forms admin: same app, but showing only the worker-forms
// area (managing/uploading forms + viewing submissions), separate from the
// family document-signing dashboard on index.html.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App workerAdmin />
  </React.StrictMode>,
);
