import { useRef } from 'react';
import { clamp, hexToRgba } from '../lib/fields.js';
import { FIELD_LABELS } from '../lib/fields.js';
import { formatDate } from '../lib/pdfUtils.js';

const MIN_W = 0.03;
const MIN_H = 0.02;

// A single placed field rendered over the page. Handles drag (move) and resize
// via pointer capture so it works the same with mouse and touch.
// `color` tints the box by its owning signer; `locked` disables interaction
// (used during signing when the field belongs to a different signer).
export default function FieldBox({
  field,
  containerRef,
  color,
  locked,
  noEdit,
  displayOnly,
  selected,
  onSelect,
  onChange,
  onDelete,
}) {
  const boxRef = useRef(null);
  const state = useRef(null);

  const begin = (mode) => (e) => {
    if (locked || displayOnly) return;
    e.stopPropagation();
    onSelect(field.id);
    // noEdit (signer fill mode): the layout is fixed — selecting opens the
    // value editor but the box can't be moved, resized or deleted.
    if (noEdit) return;
    state.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      x: field.xPct,
      y: field.yPct,
      w: field.wPct,
      h: field.hPct,
      rect: containerRef.current.getBoundingClientRect(),
    };
    boxRef.current.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const s = state.current;
    if (!s) return;
    const dx = (e.clientX - s.startX) / s.rect.width;
    const dy = (e.clientY - s.startY) / s.rect.height;
    if (s.mode === 'move') {
      onChange(field.id, {
        xPct: clamp(s.x + dx, 0, 1 - field.wPct),
        yPct: clamp(s.y + dy, 0, 1 - field.hPct),
      });
    } else {
      onChange(field.id, {
        wPct: clamp(s.w + dx, MIN_W, 1 - field.xPct),
        hPct: clamp(s.h + dy, MIN_H, 1 - field.yPct),
      });
    }
  };

  const onPointerUp = (e) => {
    if (!state.current) return;
    state.current = null;
    boxRef.current.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={boxRef}
      className={`field-box${selected ? ' selected' : ''}${locked ? ' locked' : ''} type-${field.type}`}
      style={{
        left: `${field.xPct * 100}%`,
        top: `${field.yPct * 100}%`,
        width: `${field.wPct * 100}%`,
        height: `${field.hPct * 100}%`,
        borderColor: color,
        background: hexToRgba(color, selected ? 0.16 : 0.1),
        boxShadow: selected ? `0 0 0 2px ${hexToRgba(color, 0.35)}` : 'none',
        pointerEvents: displayOnly ? 'none' : undefined,
      }}
      onPointerDown={begin('move')}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <FieldContent field={field} color={color} />
      {field.required && <span className="field-req" aria-hidden>*</span>}

      {selected && !locked && !noEdit && (
        <>
          <button
            className="field-delete"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(field.id);
            }}
            aria-label="מחק שדה"
          >
            ✕
          </button>
          <span
            className="field-resize"
            style={{ borderColor: color }}
            onPointerDown={begin('resize')}
          />
        </>
      )}
    </div>
  );
}

function FieldContent({ field, color }) {
  if (field.type === 'signature') {
    return field.value ? (
      <img className="field-sign-img" src={field.value} alt="חתימה" draggable={false} />
    ) : (
      <span className="field-placeholder" style={{ color }}>
        {FIELD_LABELS.signature}
      </span>
    );
  }
  if (field.type === 'checkbox') {
    return <span className="field-checkbox">{field.value ? '✓' : ''}</span>;
  }
  const text = field.type === 'date' ? formatDate(field.value) : field.value;
  const placeholder = field.type === 'question' ? field.label || FIELD_LABELS.question : FIELD_LABELS[field.type];
  return text ? (
    <span className="field-text">{text}</span>
  ) : (
    <span className="field-placeholder" style={{ color }}>
      {placeholder}
    </span>
  );
}
