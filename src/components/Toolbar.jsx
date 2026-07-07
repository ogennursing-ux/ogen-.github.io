import { useT } from '../lib/i18n.js';

// Action bar for the editor (the field palette lives in ToolRail).
export default function Toolbar({ onContinue, onReset, onSaveTemplate, onSaveLayout, busy, canContinue, continueLabel }) {
  const t = useT();
  return (
    <div className="toolbar">
      <div className="toolbar-actions">
        <button className="btn-ghost" onClick={onReset} disabled={busy}>
          {t('מסמך חדש')}
        </button>
        {onSaveLayout && (
          <button className="btn-ghost" onClick={onSaveLayout} disabled={busy || !canContinue}>
            {t('💾 שמור פריסת חתימות')}
          </button>
        )}
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
