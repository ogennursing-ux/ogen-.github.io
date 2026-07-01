import { useState } from 'react';
import { SCHEMA_FIELD_TYPES, newSchemaField, starterSchema } from '../lib/formSchema.js';
import { useT } from '../lib/i18n.js';

// Admin builder for a gov.il-style structured form: a title plus an ordered
// list of labeled fields the social worker will fill in.
export default function FormBuilder({ initialTitle = '', busy, onPublish, onCancel }) {
  const t = useT();
  const [title, setTitle] = useState(initialTitle);
  const [schema, setSchema] = useState(starterSchema);

  const update = (id, patch) => setSchema((s) => s.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id) => setSchema((s) => s.filter((f) => f.id !== id));
  const add = (type) => setSchema((s) => [...s, newSchemaField(type)]);
  const move = (i, dir) =>
    setSchema((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = s.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const setOption = (id, idx, val) =>
    update(id, { options: schema.find((f) => f.id === id).options.map((o, k) => (k === idx ? val : o)) });
  const addOption = (id) => update(id, { options: [...schema.find((f) => f.id === id).options, ''] });
  const removeOption = (id, idx) =>
    update(id, { options: schema.find((f) => f.id === id).options.filter((_, k) => k !== idx) });

  function publish() {
    const clean = schema
      .map((f) => ({ ...f, label: (f.label || '').trim() }))
      .filter((f) => f.label || f.type === 'section');
    if (!title.trim()) {
      alert(t('תן/י שם לטופס.'));
      return;
    }
    if (!clean.length) {
      alert(t('הוסף/י לפחות שדה אחד עם תווית.'));
      return;
    }
    onPublish(title.trim(), clean);
  }

  return (
    <div className="centered-screen">
      <div className="card builder-card">
        <h2>{t('בניית טופס לעובד סוציאלי')}</h2>
        <p className="muted">{t('הגדר/י את השדות שהעובד/ת ימלא/תמלא. גרירה לא נדרשת — פשוט מוסיפים שדות לפי הסדר.')}</p>

        <label className="field-label">{t('שם הטופס')}</label>
        <input
          className="text-input"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('לדוגמה: טופס קבלת מידע')}
        />

        <div className="builder-list">
          {schema.map((f, i) => (
            <div key={f.id} className={`builder-row${f.type === 'section' ? ' is-section' : ''}`}>
              <div className="builder-row-main">
                <input
                  className="text-input"
                  value={f.label}
                  onChange={(e) => update(f.id, { label: e.target.value })}
                  placeholder={f.type === 'section' ? t('כותרת קטע') : t('שם השדה (תווית)')}
                />
                <select
                  className="text-input builder-type"
                  value={f.type}
                  onChange={(e) => {
                    const type = e.target.value;
                    update(f.id, { type, options: type === 'select' ? f.options || ['אפשרות 1'] : undefined });
                  }}
                >
                  {SCHEMA_FIELD_TYPES.map((o) => (
                    <option key={o.type} value={o.type}>
                      {t(o.label)}
                    </option>
                  ))}
                </select>
              </div>

              {f.type === 'select' && (
                <div className="builder-options">
                  {(f.options || []).map((opt, k) => (
                    <div key={k} className="builder-option">
                      <input
                        className="text-input sm"
                        value={opt}
                        onChange={(e) => setOption(f.id, k, e.target.value)}
                        placeholder={t('אפשרות')}
                      />
                      <button className="icon-btn" onClick={() => removeOption(f.id, k)} aria-label="remove">✕</button>
                    </div>
                  ))}
                  <button className="btn-ghost sm" onClick={() => addOption(f.id)}>{t('+ אפשרות')}</button>
                </div>
              )}

              <div className="builder-row-side">
                {f.type !== 'section' && (
                  <label className="req-check">
                    <input
                      type="checkbox"
                      checked={!!f.required}
                      onChange={(e) => update(f.id, { required: e.target.checked })}
                    />
                    {t('חובה')}
                  </label>
                )}
                <button className="icon-btn" onClick={() => move(i, -1)} aria-label="up" title={t('הזז למעלה')}>↑</button>
                <button className="icon-btn" onClick={() => move(i, 1)} aria-label="down" title={t('הזז למטה')}>↓</button>
                <button className="icon-btn danger-text" onClick={() => remove(f.id)} aria-label="delete" title={t('מחק')}>🗑</button>
              </div>
            </div>
          ))}
        </div>

        <div className="builder-add">
          {SCHEMA_FIELD_TYPES.map((o) => (
            <button key={o.type} className="btn-ghost sm" onClick={() => add(o.type)}>
              + {t(o.label)}
            </button>
          ))}
        </div>

        <div className="card-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>{t('ביטול')}</button>
          <button className="btn-primary" onClick={publish} disabled={busy}>
            {busy ? t('מפרסם…') : t('פרסם טופס ›')}
          </button>
        </div>
      </div>
    </div>
  );
}
