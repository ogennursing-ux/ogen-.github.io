// Render an array of HTML "blocks" into a multi-page A4 PDF via html2canvas +
// jsPDF. Blocks are grouped into pages (so sections aren't split mid-content)
// and each page is rasterised separately — this keeps every html2canvas pass
// small and fast, even for long multi-page forms. Hebrew / RTL renders natively
// in the DOM, so the output can faithfully reproduce a designed paper form.
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

  const list = (Array.isArray(blocks) ? blocks : [blocks]).map((b) => `<div class="pb">${b}</div>`);
  const holder = document.createElement('div');
  holder.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${widthPx}px;background:#fff;` +
    `font-family:Heebo,Arial,sans-serif;direction:rtl;color:#111;${baseStyle}`;
  document.body.appendChild(holder);

  const scale = Math.min(1.6, Math.max(1.3, window.devicePixelRatio || 1.5));

  // html2canvas otherwise tries to fetch the cross-origin font stylesheets
  // (Google Fonts) on every pass to read their @font-face rules — slow, and it
  // stalls when the network is blocked. The web fonts are already loaded into
  // document.fonts, so detach those <link>s for the duration of rendering and
  // restore them afterwards; text keeps rendering in the already-loaded font.
  const detached = [];
  document.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"]').forEach((l) => {
    if (/googleapis|gstatic/i.test(l.href) && l.parentNode) {
      detached.push([l, l.parentNode, l.nextSibling]);
      l.parentNode.removeChild(l);
    }
  });

  try {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const pageHpx = (widthPx * ph) / pw; // CSS px that fill one A4 page

    // Measure each block, then pack consecutive blocks into pages.
    holder.innerHTML = list.join('');
    const heights = Array.from(holder.children).map((c) => c.offsetHeight);
    const pages = [];
    let cur = [];
    let curH = 0;
    for (let i = 0; i < list.length; i++) {
      const h = heights[i];
      if (curH + h > pageHpx && cur.length) {
        pages.push(cur);
        cur = [];
        curH = 0;
      }
      cur.push(list[i]);
      curH += h;
    }
    if (cur.length) pages.push(cur);

    let first = true;
    for (const grp of pages) {
      holder.innerHTML = grp.join('');
      // eslint-disable-next-line no-await-in-loop
      const canvas = await html2canvas(holder, {
        scale,
        backgroundColor: '#ffffff',
        onclone: (doc) => {
          doc.querySelectorAll('link[rel="stylesheet"], link[rel="preconnect"], style').forEach((el) => el.remove());
        },
      });
      const imgH = (canvas.height * pw) / canvas.width;
      if (!first) pdf.addPage();
      first = false;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pw, Math.min(imgH, ph));
    }
    return pdf.output('arraybuffer');
  } finally {
    document.body.removeChild(holder);
    detached.forEach(([l, parent, next]) => parent.insertBefore(l, next));
  }
}
