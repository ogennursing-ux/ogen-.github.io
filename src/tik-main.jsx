import './lib/polyfills.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import TikApp from './tik/TikApp.jsx';
import IntakeChat from './tik/IntakeChat.jsx';
import './index.css';

// RTL Hebrew — this standalone module has no language toggle.
document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';

// Public customer chat lives at …/#chat — no login. Everything else is the app.
const isChat = location.hash.replace(/^#\/?/, '').toLowerCase().startsWith('chat');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isChat ? <IntakeChat /> : <TikApp />}
  </React.StrictMode>,
);
