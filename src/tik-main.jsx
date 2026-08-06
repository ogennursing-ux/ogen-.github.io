import './lib/polyfills.js';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import TikApp from './tik/TikApp.jsx';
import IntakeChat from './tik/IntakeChat.jsx';
import CasesBoard from './tik/CasesBoard.jsx';
import SignFields from './tik/SignFields.jsx';
import RegistryApp from './tik/RegistryApp.jsx';
import ReportPage from './tik/ReportPage.jsx';
import Invoicing from './tik/Invoicing.jsx';
import ManotDesk from './tik/ManotDesk.jsx';
import AssistantDesk from './tik/AssistantDesk.jsx';
import ContractTemplates from './tik/ContractTemplates.jsx';
import QualityDesk from './tik/QualityDesk.jsx';
import AutoFileDesk from './tik/AutoFileDesk.jsx';
import './index.css';

document.documentElement.lang = 'he';
document.documentElement.dir = 'rtl';
// Marks this as the office / tik system so the "Anchor" theme (index.css) applies
// here; the client-facing signing app carries no such marker and stays original.
document.documentElement.setAttribute('data-app', 'office');

// Routing by hash:
//   …/#chat          → the public customer chat (no login)
//   …/#board         → the cases control room (office login)
//   …/#registry      → the source registry (families, workers, renewals)
//   …/#report/<key>  → one report, in its own browser tab
//   …/#invoices      → the tax-documents desk (receipts & invoices)
//   anything else    → the full office app (TikApp)
//
// Only the first segment chooses the app; everything after it is that app's
// own routing. Watching it here means a link from a report back to the
// registry switches apps on the spot, with no page reload.
const section = () => location.hash.replace(/^#\/?/, '').toLowerCase().split(/[/?]/)[0] || '';

function Shell() {
  const [at, setAt] = useState(section);
  useEffect(() => {
    const onHash = () => setAt(section());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (at === 'chat') return <IntakeChat />;
  if (at === 'signfields') return <SignFields />;
  if (at === 'report') return <ReportPage />;
  if (at === 'invoices') return <Invoicing />;
  if (at === 'manot') return <ManotDesk />;
  if (at === 'assistant') return <AssistantDesk />;
  if (at === 'templates') return <ContractTemplates />;
  if (at === 'quality') return <QualityDesk />;
  if (at === 'autofile') return <AutoFileDesk />;
  if (at === 'registry') return <RegistryApp />;
  if (at === 'board') return <CasesBoard />;
  return <TikApp />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><Shell /></React.StrictMode>,
);
