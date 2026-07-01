import './lib/polyfills.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import WorkerApp from './worker/WorkerApp.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WorkerApp />
  </React.StrictMode>,
);
