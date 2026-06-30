import { useEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.js';

// Crop a canvas to the bounding box of its non-transparent pixels.
// Returns a PNG data URL, or null when nothing was drawn.
function trimCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);

  let top = null;
  let bottom = 0;
  let left = null;
  let right = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (top === null) top = y;
        bottom = y;
        if (left === null || x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  if (top === null) return null;

  const pad = 10;
  left = Math.max(0, left - pad);
  top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad);
  bottom = Math.min(height - 1, bottom + pad);
  const w = right - left + 1;
  const h = bottom - top + 1;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').drawImage(canvas, left, top, w, h, 0, 0, w, h);
  return out.toDataURL('image/png');
}

const TYPE_FONTS = [
  { id: 'dancing', label: 'סגנון 1', css: "'Dancing Script', 'Heebo', cursive" },
  { id: 'caveat', label: 'סגנון 2', css: "'Caveat', 'Heebo', cursive" },
  { id: 'heebo', label: 'סגנון 3', css: "'Heebo', sans-serif" },
];

// Render typed text in a handwriting font to a trimmed transparent PNG.
function renderTypedSignature(text, fontCss) {
  const ss = 3;
  const fontSize = 64;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${fontSize}px ${fontCss}`;
  const width = Math.ceil(measure.measureText(text).width) + 60;
  const height = Math.ceil(fontSize * 1.8);

  const canvas = document.createElement('canvas');
  canvas.width = width * ss;
  canvas.height = height * ss;
  const ctx = canvas.getContext('2d');
  ctx.scale(ss, ss);
  ctx.font = `${fontSize}px ${fontCss}`;
  ctx.fillStyle = '#0b1f33';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  return trimCanvas(canvas);
}

export default function SignaturePad({ onSave, onClose }) {
  const t = useT();
  const [mode, setMode] = useState('draw');
  const [typed, setTyped] = useState('');
  const [font, setFont] = useState(TYPE_FONTS[0]);

  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const hasInk = useRef(false);

  useEffect(() => {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#0b1f33';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    hasInk.current = false;
  }, [mode]);

  const pointFromEvent = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pointFromEvent(e);
    canvasRef.current.setPointerCapture(e.pointerId);
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pointFromEvent(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasInk.current = true;
  };

  const end = (e) => {
    drawing.current = false;
    canvasRef.current.releasePointerCapture?.(e.pointerId);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
  };

  const save = async () => {
    if (mode === 'draw') {
      onSave(hasInk.current ? trimCanvas(canvasRef.current) : null);
      return;
    }
    const text = typed.trim();
    if (!text) {
      onSave(null);
      return;
    }
    // Make sure the chosen web font is ready before rasterizing.
    if (document.fonts?.load) {
      try {
        await document.fonts.load(`64px ${font.css}`);
      } catch {
        /* fall back to whatever is available */
      }
    }
    onSave(renderTypedSignature(text, font.css));
  };

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="sign-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sign-modal-head">
          <h3>{t('חתימה')}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>

        <div className="sign-tabs">
          <button
            className={`sign-tab${mode === 'draw' ? ' active' : ''}`}
            onClick={() => setMode('draw')}
          >
            {t('ציור')}
          </button>
          <button
            className={`sign-tab${mode === 'type' ? ' active' : ''}`}
            onClick={() => setMode('type')}
          >
            {t('הקלדה')}
          </button>
        </div>

        {mode === 'draw' ? (
          <>
            <p className="sign-hint">{t('צייר את חתימתך באמצעות העכבר או האצבע')}</p>
            <canvas
              ref={canvasRef}
              className="sign-canvas"
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          </>
        ) : (
          <>
            <input
              className="text-input"
              type="text"
              value={typed}
              placeholder={t('הקלד את שמך')}
              autoFocus
              onChange={(e) => setTyped(e.target.value)}
            />
            <div className="font-choices">
              {TYPE_FONTS.map((f) => (
                <button
                  key={f.id}
                  className={`font-choice${font.id === f.id ? ' active' : ''}`}
                  style={{ fontFamily: f.css }}
                  onClick={() => setFont(f)}
                >
                  {typed.trim() || t('חתימה')}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="sign-actions">
          {mode === 'draw' && (
            <button className="btn-ghost" onClick={clear}>
              {t('נקה')}
            </button>
          )}
          <button className="btn-primary" onClick={save}>
            {t('שמור חתימה')}
          </button>
        </div>
      </div>
    </div>
  );
}
