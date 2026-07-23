import './lib/polyfills.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import TikApp from './tik/TikApp.jsx';
import IntakeChat from './tik/IntakeChat.jsx';
import CasesBoard from './tik/CasesBoard.jsx';
import SignFields from './tik/SignFields.jsx';
import './index.css';

// RTL Hebrew — this standalone module has no language toggle.
document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';

// Routing by hash:
//   …/#chat   → the public customer chat (no login)
//   …/#board  → the cases control room (office login)
//   anything else → the full office app (TikApp)
const route = location.hash.replace(/^#\/?/, '').toLowerCase();
const isChat = route.startsWith('chat');
const isBoard = route.startsWith('board');
const isSignFields = route.startsWith('signfields');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isChat ? <IntakeChat /> : isSignFields ? <SignFields /> : isBoard ? <CasesBoard /> : <TikApp />}
  </React.StrictMode>,
);
