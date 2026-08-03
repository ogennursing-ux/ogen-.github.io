// Windows-1255 (Hebrew) byte encoder.
//
// משרד הפנים requires the מנות files in CP1255 — UTF-8 corrupts the Hebrew on
// their terminals. The browser has no built-in CP1255 encoder, so this maps the
// characters the files actually use: ASCII, the Hebrew alphabet, geresh /
// gershayim and a few common punctuation marks. Anything outside the map is
// replaced with a space, so a stray glyph can never shift the fixed-width grid.

const EXTRA = {
  0x20aa: 0xa4, // ₪ shekel
  0x05f3: 0xd7, // ׳ geresh
  0x05f4: 0xd8, // ״ gershayim
  0x2013: 0x96, // – en dash
  0x2014: 0x97, // — em dash
  0x201c: 0x93, 0x201d: 0x94, // “ ”
  0x2018: 0x91, 0x2019: 0x92, // ‘ ’
  0x00d7: 0xaa, // ×
  0x00f7: 0xba, // ÷
};

// One character → its CP1255 byte.
export function cp1255Byte(ch) {
  const c = ch.codePointAt(0);
  if (c <= 0x7f) return c; // ASCII passes through unchanged
  if (c >= 0x05d0 && c <= 0x05ea) return 0xe0 + (c - 0x05d0); // א..ת
  if (EXTRA[c] != null) return EXTRA[c];
  return 0x20; // unknown → space (keeps the fixed width intact)
}

// A whole string → CP1255 bytes.
export function encodeCp1255(str) {
  const chars = [...String(str ?? '')];
  const out = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) out[i] = cp1255Byte(chars[i]);
  return out;
}
