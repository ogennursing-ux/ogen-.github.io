import { useT } from '../lib/i18n.js';

// Action bar for the editor (the field palette lives in ToolRail).
export default function Toolbar({ onContinue, onReset, onSaveTemplate, busy, canContinue, continueLabel }) {
  const t = useT();
  return (
    <div className="toolbar">
      <div className="toolbar-actions">
        <button className="btn-ghost" onClick={onReset} disabled={busy}>
          {t('מסמך חדש')}
        </button>
        {onSaveTemplate && (
          <button className="btn-ghost" onClick={onSaveTemplate} disabled={busy || !canContinue}>
            {t('שמור כתבנית')}
          </button>
        )}
        <button className="btn-primary" onClick={onContinue} disabled={busy || !canContinue}>
          {continueLabel || t('צור קישור לחתימה ›')}
        </button>
      </div>
    </div>
  );
}
