import { useEffect, useState } from 'react';
import FormSignerView from './FormSignerView.jsx';
import StructuredFormView from './StructuredFormView.jsx';
import LangToggle from './LangToggle.jsx';
import { api } from '../lib/api.js';
import { isStructuredForm } from '../lib/formSchema.js';
import { useT } from '../lib/i18n.js';

// Loads a worker form by id and routes to the right filling experience:
// a structured gov.il-style form, or the PDF-overlay signer flow.
export default function WorkerFormRouter({ id, brandIcon = '📋', brandLabel = 'טפסים לעובדים סוציאליים', onBack }) {
  const t = useT();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });
    api
      .getTemplate(id)
      .then((tmpl) => alive && setState({ status: 'ready', tmpl }))
      .catch((e) => alive && setState({ status: 'error', error: e.message }));
    return () => {
      alive = false;
    };
  }, [id]);

  if (state.status === 'loading' || state.status === 'error') {
    return (
      <div className="app">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">{brandIcon}</span>
            <span className="brand-name">{t(brandLabel)}</span>
          </div>
          <div className="header-actions">
            <LangToggle />
            {onBack && <button className="header-settings" onClick={onBack}>{t('חזרה לרשימה')}</button>}
          </div>
        </header>
        <div className="centered-screen">
          {state.status === 'loading' ? (
            <p className="muted">{t('טוען מסמך…')}</p>
          ) : (
            <div className="card"><h2>{t('לא ניתן לפתוח את המסמך')}</h2><p className="muted">{state.error}</p></div>
          )}
        </div>
      </div>
    );
  }

  if (isStructuredForm(state.tmpl)) {
    return <StructuredFormView template={state.tmpl} brandIcon={brandIcon} brandLabel={brandLabel} onBack={onBack} />;
  }
  return <FormSignerView id={id} brandIcon={brandIcon} brandLabel={brandLabel} onBack={onBack} />;
}
