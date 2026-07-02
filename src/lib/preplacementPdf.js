// Faithful PDF rendition of "דו"ח טרום השמה" (form 476) — mirrors the original
// 4-page official form: header, personal-details grids, address, cohabitants,
// current location, contact person, medical/functional status, community
// services, income, requested-worker profile, duties, summary and signatures.
// Rendered from HTML → multi-page A4 PDF (perfect Hebrew RTL).
import { htmlToPdf } from './htmlPdf.js';
import { COMPANY_NAME } from './workerPortal.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const fmtDate = (val) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(val || '');
};

const S = {
  h1: 'font-size:16px;font-weight:800;text-align:center;margin:0 0 2px;color:#0f3d5e;',
  h2: 'font-size:14px;font-weight:800;text-align:center;margin:0 0 3px;',
  sub: 'font-size:10.5px;text-align:center;color:#444;margin:0 0 8px;',
  rule: 'border:none;border-top:2px solid #0f3d5e;margin:3px 0 8px;',
  sec: 'font-size:13px;font-weight:800;background:#eef2f7;border:1px solid #d7deea;border-radius:4px;padding:4px 8px;margin:2px 0 5px;',
  item: 'font-weight:700;font-size:12px;margin:3px 0 2px;',
  box: 'border:1px solid #cbd3e0;border-radius:5px;padding:6px 8px;margin:1px 0 6px;min-height:30px;white-space:pre-wrap;word-break:break-word;',
  row: 'display:flex;flex-wrap:wrap;align-items:center;gap:3px 12px;margin:3px 0;',
  lbl: 'font-weight:700;white-space:nowrap;',
  val: 'display:inline-block;border-bottom:1px solid #888;padding:0 4px 1px;min-height:14px;',
  cb: 'display:inline-block;margin:1px 3px 1px 8px;white-space:nowrap;',
  table: 'width:100%;border-collapse:collapse;margin:0 0 8px;table-layout:fixed;',
  td: 'border:1px solid #b9c2d0;padding:3px 5px;vertical-align:top;font-size:11px;word-break:break-word;',
  clbl: 'font-weight:700;font-size:10px;color:#374151;display:block;margin-bottom:2px;',
  cval: 'display:block;min-height:13px;font-size:11.5px;',
  base: 'font-size:12px;line-height:1.45;padding:26px 30px;',
};

// Lightweight unicode checkbox — far cheaper for html2canvas than a bordered,
// flex-laid-out box (this form has hundreds of them).
const cb = (c, label) => `<span style="${S.cb}">${c ? '☑' : '☐'} ${esc(label)}</span>`;

export async function renderPreplacementPdf(_title, _schema, values) {
  const v = values || {};
  const opt = (id, options) => options.map((o) => cb(v[id] === o, o)).join('');
  const cl = (id, options) => options.map((o) => cb(Array.isArray(v[id]) && v[id].includes(o), o)).join('');
  const fld = (label, value, minW = 80) =>
    `<span style="display:inline-flex;align-items:flex-end;gap:4px"><span style="${S.lbl}">${esc(label)}:</span><span style="${S.val};min-width:${minW}px">${esc(value)}</span></span>`;
  const item = (label, id) => `<div style="${S.item}">${esc(label)}</div><div style="${S.box}">${esc(v[id])}</div>`;
  const sig = (id) =>
    v[id]
      ? `<img src="${v[id]}" style="height:40px;max-width:170px;object-fit:contain;display:block;margin:0 auto 2px" />`
      : `<div style="height:40px"></div>`;

  // table cell helpers
  const cell = (label, inner, colspan = 1, w) =>
    `<td style="${S.td}${w ? `;width:${w}` : ''}" colspan="${colspan}"><span style="${S.clbl}">${esc(label)}</span><span style="${S.cval}">${inner}</span></td>`;
  const vcell = (label, id, colspan = 1, w) => cell(label, esc(v[id]), colspan, w);
  const ocell = (label, id, options, colspan = 1) =>
    `<td style="${S.td}" colspan="${colspan}"><span style="${S.clbl}">${esc(label)}</span><div>${opt(id, options)}</div></td>`;
  const table = (rows) => `<table style="${S.table}">${rows}</table>`;
  const tr = (cells) => `<tr>${cells}</tr>`;

  const blocks = [];

  // Header
  blocks.push(
    `<div><div style="${S.h1}">${esc(COMPANY_NAME)}</div>` +
      `<div style="${S.h2}">דו"ח טרום השמה</div>` +
      `<div style="${S.sub}">אין לערוך או לשנות תוכן דו"ח זה. יש למלא את השדות הרלוונטיים במלואם, בכתב קריא וברור.</div>` +
      `<hr style="${S.rule}" /></div>`,
  );

  // ===== עמוד 1 =====
  blocks.push(
    `<div>${table(tr(cell('תאריך הביקור', esc(fmtDate(v.visitDate))) + vcell('שם הלשכה', 'bureauName') + vcell('שם העו"ס מבצע/ת הביקור', 'swName') + vcell('נכחו בביקור', 'attendees')))}</div>`,
  );

  blocks.push(
    `<div><div style="${S.sec}">פרטים אישיים של המטופל/ת</div>` +
      table(
        tr(vcell('שם משפחה', 'pLastName') + vcell('שם פרטי', 'pFirstName') + vcell('תעודת זהות', 'pId') + vcell('תאריך לידה', 'pBirthDate') + ocell('מין', 'pSex', ['זכר', 'נקבה'])) +
          tr(vcell('טלפון נייד', 'pMobile') + vcell('טלפון נייח', 'pPhone') + vcell('דואר אלקטרוני', 'pEmail') + vcell('ארץ מוצא', 'pCountry') + vcell('שנת עליה', 'pAliyaYear')) +
          tr(ocell('עישון', 'pSmoking', ['כן', 'לא']) + ocell('בעלי חיים', 'pPets', ['כן', 'לא']) + ocell('שמירת שבת', 'pShabbat', ['כן', 'לא']) + ocell('שמירת כשרות', 'pKosher', ['כן', 'לא']) + vcell('משקל / גובה', 'pWeight')) +
          tr(ocell('לאום', 'pNationality', ['יהודי', 'מוסלמי', 'נוצרי', 'בדואי', 'דרוזי', 'אחר'], 2) + ocell('זרם דתי', 'pReligiousStream', ['חרדי', 'דתי', 'מסורתי', 'חילוני', 'אחר'], 2) + vcell('שפות', 'pLanguages')) +
          tr(ocell('מצב משפחתי', 'pMaritalStatus', ['רווק/ה', 'נשוי/אה', 'אלמן/ה', 'פרוד/ה', 'גרוש/ה', 'ידוע/ה בציבור'], 5)),
      ) +
      `</div>`,
  );

  blocks.push(
    `<div><div style="${S.sec}">כתובת מגורי המטופל/ת</div>` +
      table(
        tr(vcell('רחוב', 'aStreet', 2) + vcell('מס\' בית', 'aHouseNo') + vcell('מס\' דירה', 'aApt') + vcell('כניסה', 'aEntrance')) +
          tr(vcell('עיר', 'aCity', 2) + vcell('קומה', 'aFloor') + ocell('מעלית', 'aElevator', ['כן', 'לא']) + vcell('מס\' חדרים', 'aRooms')) +
          tr(ocell('האם הכתובת הנ"ל היא של דיור מוגן?', 'aShelteredHousing', ['כן', 'לא'], 5)),
      ) +
      `</div>`,
  );

  const cohRow = (n) =>
    tr(
      cell('', String(n), 1, '4%') +
        vcell('שם משפחה', `coh${n}Last`) +
        vcell('שם פרטי', `coh${n}First`) +
        vcell('קרבה למטופל/ת', `coh${n}Rel`) +
        vcell('עיסוק', `coh${n}Job`) +
        vcell('גיל', `coh${n}Age`) +
        vcell('הערות', `coh${n}Notes`),
    );
  blocks.push(
    `<div><div style="${S.sec}">אנשים הגרים עם המטופל/ת תחת קורת גג משותפת</div>` +
      table(cohRow(1) + cohRow(2) + cohRow(3)) +
      `</div>`,
  );

  // ===== עמוד 2 =====
  blocks.push(
    `<div><div style="${S.sec}">המטופל/ת נמצא/ת כעת ב:</div>` +
      `<div style="${S.row}">${opt('curLocation', ['בכתובת הנ"ל', 'בדיור מוגן', 'בבית חולים', 'בכתובת אחרת'])}</div>` +
      `<div style="${S.row}">${fld('שם דיור מוגן', v.shelterName, 120)}${fld('כתובת', v.shelterAddr, 160)}</div>` +
      `<div style="${S.row}">${fld('שם בית החולים', v.hospName, 130)}${fld('מחלקה', v.hospDept, 90)}${fld('תאריך שחרור', v.hospRelease, 90)}</div>` +
      `<div style="${S.row}">${fld('כתובת אחרת – אצל', v.otherAt, 110)}${fld('כתובת', v.otherAddr, 160)}</div></div>`,
  );

  blocks.push(
    `<div><div style="${S.sec}">פרטי איש קשר (במקרים בהם המטופל אינו מסוגל למלא את חובתו כמעסיק)</div>` +
      table(
        tr(ocell('קרבה', 'contactRel', ['הורה', 'בן/בת', 'אח/ות', 'בן/ת זוג', 'אפוטרופוס', 'אחר'], 2) + vcell('שם משפחה', 'contactLast') + vcell('שם פרטי', 'contactFirst') + vcell('טלפון נייד', 'contactMobile') + vcell('הערות', 'contactNotes')),
      ) +
      `</div>`,
  );

  blocks.push(
    `<div><div style="${S.sec}">תיאור מצב המטופל/ת</div>` +
      item('בריאותי – פיזיולוגי (פרט)', 'healthPhysical') +
      `<div style="${S.row}"><span style="${S.lbl}">נפשי – פסיכיאטרי:</span>${opt('mentalState', ['אין', 'יש', 'לא ידוע', 'לא אובחן'])}</div>` +
      `<div style="${S.box}">${esc(v.mentalDetail)}</div>` +
      `<div style="${S.item}">קוגניטיבי</div><div style="${S.row}">${cl('cognitive', ['מתמצא בזמן ובמקום', 'ירידה קלה בהתמצאות', 'ירידה משמעותית בהתמצאות', 'הפרעה בדיבור', 'אין מידע', 'אחר'])}</div></div>`,
  );

  blocks.push(
    `<div><div style="${S.item}">תפקודי</div>` +
      table(
        tr(cell('ניידות', cl('mobility', ['מתהלך', 'הליכון', 'כיסא גלגלים', 'מרותק למיטה', 'סיוע במנוף למעברים', 'אחר']), 5)) +
          tr(cell('שליטה על סוגרים', opt('continence', ['מלאה', 'חלקית', 'מוצרי ספיגה', 'אמצעי עזר']), 5)) +
          tr(cell('ראיה', opt('vision', ['תקינה', 'חלשה', 'עיוור', 'אחר'])) + cell('שמיעה', opt('hearing', ['תקינה', 'חלשה', 'כבד/ת שמיעה', 'אחר']), 4)) +
          tr(cell('הלבשה', opt('dressing', ['עצמאי', 'זקוק לעזרה חלקית', 'זקוק לעזרה מלאה', 'אחר']), 5)) +
          tr(cell('אכילה', opt('eating', ['עצמאי', 'זקוק לעזרה חלקית', 'זקוק לעזרה מלאה', 'אחר']), 5)) +
          tr(cell('רחצה', opt('bathing', ['עצמאי', 'זקוק לעזרה חלקית', 'זקוק לעזרה מלאה', 'אחר']), 5)),
      ) +
      `</div>`,
  );

  // ===== עמוד 3 =====
  blocks.push(
    `<div><div style="${S.sec}">פרטים נוספים</div>` +
      `<div style="${S.item}">שירותים תומכים בקהילה</div><div style="${S.row}">${cl('communityServices', ['עוזרת בית', 'טיפול בית חוק סיעוד', 'אפוטרופוס', 'מתנדב/שכן', 'מרכז יום', 'קופת חולים', 'אחר'])}</div>` +
      `<div style="${S.row}"><span style="${S.lbl}">מטפלים קודמים:</span>${opt('prevCaregivers', ['לא', 'כן'])}${fld('סיבת עזיבה', v.prevCaregiversReason, 200)}</div>` +
      `<div style="${S.item}">מקורות הכנסה</div><div style="${S.row}">${cl('incomeSources', ['קצבת ביטוח לאומי ללא השלמת הכנסה', 'קצבת ביטוח לאומי עם השלמת הכנסה', 'פנסיה מהעבודה', 'רנטה / שילומים', 'אחר'])}</div></div>`,
  );

  blocks.push(`<div>${item('תיאור מצב המטופל/ת ובן/בת הזוג מההיבט התפקודי-קוגניטיבי', 'functionalCognitiveDesc')}</div>`);
  blocks.push(`<div>${item('תיאור מצב סוציו-אקונומי ותיאור תנאי מגורים (מטפל ומטופל)', 'socioEconomicDesc')}</div>`);

  blocks.push(
    `<div><div style="${S.sec}">פרטי עובד/ת זר/ה מבוקש/ת</div>` +
      table(
        tr(ocell('מין', 'wSex', ['זכר', 'נקבה']) + vcell('ארץ מוצא', 'wCountry') + vcell('שפות', 'wLanguages') + vcell('טווח גילאים', 'wAgeRange') + vcell('דת', 'wReligion')) +
          tr(vcell('מצב משפחתי', 'wMaritalStatus') + vcell('נתונים פיזיים', 'wPhysical') + vcell('נתונים אישיותיים', 'wPersonality') + vcell('כישורים מיוחדים נדרשים', 'wSkills') + ocell('נדרש רישיון נהיגה', 'wDriving', ['כן', 'לא'])),
      ) +
      `<div style="${S.item}">תפקידי העובד/ת הזר/ה</div><div style="${S.row}">${cl('wDuties', ['ניקיון', 'כביסה', 'הלבשה', 'רחצה', 'בישול', 'האכלה', 'החתלה', 'ליווי לטיפולים רפואיים', 'טיפול לילה', 'השגחה ערה בלילות', 'מתן תרופות', 'קניות / סידורים', 'אחר'])}</div>` +
      `<div style="${S.row}"><span style="${S.lbl}">יום חופשה:</span>${cl('wDayOff', ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'])}</div>` +
      `<div style="${S.row}"><span style="${S.lbl}">מגורי העובד/ת:</span>${opt('wHousing', ['חדר פרטי', 'חדר עם המטופל (נדרש לצרף תמונות)', 'אחר'])}</div>` +
      item('ציפיות מהעובד/ת הזר/ה', 'wExpectations') +
      `</div>`,
  );

  // ===== עמוד 4 =====
  blocks.push(`<div><div style="${S.sec}">סיכום והמלצות העובד/ת הסוציאלי/ת מבצע/ת הביקור</div><div style="${S.box};min-height:90px">${esc(v.summary)}</div></div>`);

  const sigCell = (label, inner) =>
    `<td style="${S.td};text-align:center"><div style="min-height:42px">${inner}</div><div style="border-top:1px solid #333;margin-top:2px;padding-top:2px;font-weight:700;font-size:11px">${esc(label)}</div></td>`;
  blocks.push(
    `<div><div style="${S.sec}">הצהרת העובד/ת הסוציאלי/ת מבצע/ת הביקור</div>` +
      `<div style="font-size:10.5px;line-height:1.5;margin:2px 0 8px">במעמד הביקור הוסברו למעסיק / מטופל כלל חובותיו כלפי העובד הזר (תנאי העסקה, מתן תנאי מגורים הולמים, תשלום שכר, הסדרת ביטוח רפואי ועוד) וכי בחוזה ההעסקה שיחתם בין המעסיק/המטופל לבין העובד/ת הזר/ה, תפורטנה חובות אלו בהרחבה.</div>` +
      table(tr(sigCell('שם העו"ס מבצע/ת הביקור', `<div style="padding-top:18px">${esc(v.performerName)}</div>`) + sigCell('חותמת + חתימה', sig('performerSignature')) + sigCell('שם המטופל / בן משפחה / אפוטרופוס', `<div style="padding-top:18px">${esc(v.patientName)}</div>`) + sigCell('חתימה', sig('patientSignature')))) +
      `<div style="${S.sec};margin-top:10px">חתימת עובד/ת סוציאלי/ת אחראי/ת</div>` +
      table(tr(sigCell('שם ומשפחה', `<div style="padding-top:18px">${esc(v.seniorName)}</div>`) + sigCell('חותמת + חתימה', sig('seniorSignature')))) +
      `</div>`,
  );

  return htmlToPdf(blocks, { baseStyle: S.base });
}
