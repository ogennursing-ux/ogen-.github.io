// Render an array of HTML "blocks" into a multi-page A4 PDF via html2canvas +
// jsPDF. The document is rasterised once (fast), then sliced into pages at the
// gaps *between* blocks so sections aren't cut mid-content (a single block
// taller than a page is split as a fallback). Hebrew / RTL renders natively in
// the DOM, so the output can faithfully reproduce a designed paper form.
export async function htmlToPdf(blocks, { widthPx = 794, baseStyle = '' } = {}) {
  const html2canvas = (await import('html2canvas')).default;
  const { jsPDF } = await import('jspdf');
  if (document.fonts?.ready) {
    try {
      await document.fonts.load('700 15px Heebo');
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }

  const list = Array.isArray(blocks) ? blocks : [blocks];
  const holder = document.createElement('div');
  holder.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${widthPx}px;background:#fff;` +
    `font-family:Heebo,Arial,sans-serif;direction:rtl;color:#111;${baseStyle}`;
  holder.innerHTML = list.map((b) => `<div class="pb">${b}</div>`).join('');
  document.body.appendChild(holder);

  try {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const pageHpx = (widthPx * ph) / pw; // CSS px that fill one A4 page

    // Choose page-break y positions (CSS px) at block boundaries.
    const children = Array.from(holder.children);
    const total = holder.scrollHeight;
    const segments = [];
    let start = 0;
    for (const ch of children) {
      const bottom = ch.offsetTop + ch.offsetHeight;
      if (bottom - start > pageHpx && ch.offsetTop > start) {
        segments.push([start, ch.offsetTop]);
        start = ch.offsetTop;
      }
    }
    segments.push([start, total]);

    const canvas = await html2canvas(holder, { scale: 2, backgroundColor: '#ffffff' });
    const sc = canvas.width / widthPx; // actual rendered scale

    let first = true;
    const addSlice = (yPx, hPx) => {
      const sYs = Math.round(yPx * sc);
      const sHs = Math.round(hPx * sc);
      if (sHs <= 0) return;
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sHs;
      slice.getContext('2d').drawImage(canvas, 0, sYs, canvas.width, sHs, 0, 0, canvas.width, sHs);
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, (sHs * pw) / canvas.width);
    };

    for (const [s, e] of segments) {
      let y = s;
      // Fallback: a single segment taller than a page is split by page height.
      while (e - y > pageHpx + 1) {
        addSlice(y, pageHpx);
        y += pageHpx;
      }
      addSlice(y, e - y);
    }
    return pdf.output('arraybuffer');
  } finally {
    document.body.removeChild(holder);
  }
}
