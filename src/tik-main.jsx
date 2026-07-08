import './lib/polyfills.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import TikApp from './tik/TikApp.jsx';
import './index.css';

// RTL Hebrew — this standalone module has no language toggle.
document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TikApp />
  </React.StrictMode>,
);
