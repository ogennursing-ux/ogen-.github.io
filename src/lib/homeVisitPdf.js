// Faithful PDF rendition of "טופס ב' – ביקור בית" that mirrors the original
// paper form: company header, inline labelled fields, drawn checkboxes, numbered
// assessment items and two signature blocks. Rendered from HTML so Hebrew (RTL)
// comes out exactly right, then converted to a multi-page A4 PDF.
import { htmlToPdf } from './htmlPdf.js';
import { COMPANY_NAME } from './workerPortal.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const fmtDate = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : esc(v || '');
};

const S = {
  h1: 'font-size:17px;font-weight:800;text-align:center;margin:0 0 2px;color:#0f3d5e;',
  h2: 'font-size:14px;font-weight:800;text-align:center;margin:0 0 4px;',
  rule: 'border:none;border-top:2px solid #0f3d5e;margin:4px 0 8px;',
  sec: 'font-size:13.5px;font-weight:800;background:#eef2f7;border:1px solid #d7deea;border-radius:5px;padding:5px 9px;margin:2px 0 6px;',
  row: 'display:flex;flex-wrap:wrap;align-items:flex-end;gap:3px 14px;margin:4px 0;',
  lbl: 'font-weight:700;white-space:nowrap;',
  val: 'display:inline-block;border-bottom:1px solid #888;padding:0 5px 1px;min-height:15px;',
  box: 'border:1px solid #cbd3e0;border-radius:5px;padding:6px 8px;margin:1px 0 6px;min-height:30px;white-space:pre-wrap;word-break:break-word;',
  item: 'font-weight:700;font-size:12.5px;margin:2px 0 2px;',
  cb: 'display:inline-flex;align-items:center;gap:4px;margin:0 3px;white-space:nowrap;',
  cbbox: 'display:inline-block;width:12px;height:12px;border:1.3px solid #333;text-align:center;line-height:11px;font-size:11px;color:#0f3d5e;',
  base: 'font-size:13px;line-height:1.5;padding:30px 34px;',
};

const box = (checked) => `<span style="${S.cbbox}">${checked ? '✔' : ''}</span>`;
const cb = (checked, label) => `<span style="${S.cb}">${box(checked)}${esc(label)}</span>`;
const fld = (label, value, minW = 90) =>
  `<span style="display:inline-flex;align-items:flex-end;gap:4px;"><span style="${S.lbl}">${esc(label)}:</span>` +
  `<span style="${S.val};min-width:${minW}px">${esc(value)}</span></span>`;

export async function renderHomeVisitPdf(_title, _schema, values) {
  const v = values || {};
  const opt = (id, options) => options.map((o) => cb(v[id] === o, o)).join('');
  const cl = (id, options) =>
    options.map((o) => cb(Array.isArray(v[id]) && v[id].includes(o), o)).join('');
  const item = (label, id) =>
    `<div style="${S.item}">${esc(label)}</div><div style="${S.box}">${esc(v[id])}</div>`;
  const sig = (id) =>
    v[id]
      ? `<img src="${v[id]}" style="height:44px;max-width:190px;object-fit:contain;display:block;margin:0 auto 2px" />`
      : `<div style="height:44px"></div>`;

  const blocks = [];

  blocks.push(
    `<div><div style="${S.h1}">${esc(COMPANY_NAME)}</div>` +
      `<div style="${S.h2}">טופס ב' &ndash; ביקור בית</div><hr style="${S.rule}" /></div>`,
  );

  blocks.push(
    `<div><div style="${S.sec}">פרטי הביקור</div>` +
      `<div style="${S.row}"><span style="${S.lbl}">סוג ביקור:</span>${opt('visitType', ['לאחר', 'שוטף', 'הכרות / רישום', 'ועדה חריגה', 'חוות דעת'])}</div>` +
      `<div style="${S.row}">${fld('שם עו"ס / בכיר', v.swName, 170)}${fld('תאריך הביקור', fmtDate(v.visitDate), 110)}</div></div>`,
  );

  blocks.push(
    `<div><div style="${S.sec}">פרטי המעסיק</div>` +
      `<div style="${S.row}">${fld('שם', v.empName, 150)}${fld('ת.ז', v.empId, 110)}${fld('גיל', v.empAge, 50)}</div>` +
      `<div style="${S.row}">${fld('כתובת', v.empAddress, 200)}${fld('טלפון', v.empPhone, 110)}</div>` +
      `<div style="${S.row}">${fld('איש קשר', v.empContact, 130)}${fld('קירבה', v.empRelation, 90)}${fld('נייד', v.empMobile, 110)}</div></div>`,
  );

  blocks.push(
    `<div><div style="${S.sec}">פרטי העו"ז (העובד/ת הזר/ה)</div>` +
      `<div style="${S.row}">${fld('שם', v.fwName, 150)}${fld('דרכון', v.fwPassport, 120)}${fld('נייד', v.fwMobile, 110)}</div>` +
      `<div style="${S.row}">${fld('ארץ מוצא', v.fwCountry, 110)}${fld('תחילת העסקה', v.fwStart, 110)}<span style="${S.lbl}">השמה:</span>${opt('fwPlacement', ['מהארץ', 'מחו"ל'])}${fld('לשכה מייבאת', v.fwAgency, 120)}</div>` +
      `<div style="${S.row}">${fld('עיר בסופ"ש', v.fwCity, 120)}${fld('רחוב', v.fwStreet, 120)}${fld('מס\'', v.fwHouseNo, 45)}${fld('כניסה', v.fwEntrance, 45)}${fld('דירה', v.fwApt, 45)}${fld('יום החופשה', v.fwDayOff, 80)}</div>` +
      `<div style="${S.row}">${fld('ביקור אחרון – טרום', v.lastVisitPre, 100)}${fld('לאחר השמה', v.lastVisitPost, 100)}</div></div>`,
  );

  // דיווח על המעסיק
  blocks.push(`<div><div style="${S.sec}">דיווח על המעסיק</div></div>`);
  blocks.push(item('1. תיאור הופעה חיצונית (רגוע, ניקיון, לבוש לפי העונה, ריחות, הזנחה וכד\')', 'empAppearance'));
  blocks.push(item('2. תיאור מצב תזונתי (בהתאם לגילו, רזה, שמן וכד\')', 'empNutrition'));
  blocks.push(item('3. תיאור סממנים חיצוניים חריגים (סימנים כחולים, שטפי דם, מצב רוח ירוד, מתח, חרדה וכד\')', 'empAbnormal'));
  blocks.push(item('4. תיאור מצבו התפקודי (עצמאי / זקוק לעזרה / תלוי בזולת / סיעודי / מרותק למיטה / שליטה על סוגרים)', 'empFunctional'));
  blocks.push(item('5. תיאור מצבו הבריאותי (תקין / מחלות כרוניות / אירועים משמעותיים: מחלות, נפילות וכד\')', 'empHealth'));
  blocks.push(
    `<div><div style="${S.row}"><span style="${S.lbl}">6. האם אושפז לאחרונה?</span>${opt('empHospitalized', ['לא', 'כן'])}${fld('היכן', v.empHospWhere, 110)}${fld('משך האשפוז', v.empHospDuration, 90)}</div></div>`,
  );
  blocks.push(item('7. תיאור קוגניטיבי (תקשורת: הבנה / הבעה / קוגניציה; התנהגות: חברתית / פתרון בעיות / זיכרון)', 'empCognitive'));
  blocks.push(item('8. התרשמות מתחזוקת הבית (ניקיון / אוורור / חימום / שירותים / מטבח וכד\')', 'empHome'));
  blocks.push(item('9. קניית מזון עבור הקשיש והעו"ז ואספקת ארוחות (מי קונה / מתי / איך)', 'empFood'));
  blocks.push(item('10. שביעות רצון הקשיש מהמטפל (גבוהה / מרוצה / אינו מרוצה / מבקש להחליף)', 'empSatCaregiver'));
  blocks.push(item('11. שביעות רצון המשפחה מהמטפל (גבוהה / מרוצה / אינו מרוצה / מבקש להחליף)', 'empFamilySat'));
  blocks.push(
    `<div><div style="${S.row}"><span style="${S.lbl}">12. האם יש קשיים או תלונות במתן השירות?</span>${opt('empServiceIssues', ['אין', 'יש'])}</div><div style="${S.box}">${esc(v.empServiceIssuesDetail)}</div></div>`,
  );
  blocks.push(
    `<div><div style="${S.row}"><span style="${S.lbl}">13. בקשות מיוחדות של המעסיק?</span>${opt('empSpecialReq', ['אין', 'יש'])}</div><div style="${S.box}">${esc(v.empSpecialReqDetail)}</div></div>`,
  );

  // דיווח על העו"ז
  blocks.push(`<div><div style="${S.sec}">דיווח על העו"ז</div></div>`);
  blocks.push(item('1. תיאור הופעה חיצונית (רגוע, ניקיון, לבוש, ריחות, ביטחון וכד\')', 'fwAppearance'));
  blocks.push(
    `<div><div style="${S.row}"><span style="${S.lbl}">2. האם העו"ז קיבל הדרכה טרם תחילת העבודה?</span>${opt('fwTraining', ['כן', 'לא'])}</div><div style="${S.box}">${esc(v.fwTrainingDetail)}</div></div>`,
  );
  blocks.push(
    `<div><div style="${S.item}">3. תפקידי העו"ז</div><div style="${S.row}">${cl('fwDuties', ['ניקיון', 'כביסה', 'רחצה', 'האכלה', 'בישול', 'החתלה', 'הלבשה', 'ליווי לטיפולים רפואיים', 'השגחה בלילה', 'מתן תרופות', 'קניות / סידורים'])}</div></div>`,
  );
  blocks.push(
    `<div><div style="${S.row}"><span style="${S.lbl}">4. האם העו"ז מרוצה?</span>${opt('fwSatisfied', ['כן', 'לא'])}</div><div style="${S.box}">${esc(v.fwSatisfiedDetail)}</div></div>`,
  );
  blocks.push(
    `<div><div style="${S.row}"><span style="${S.lbl}">5. האם נצפו קשיים בעבודה עם הקשיש?</span>${opt('fwDifficulties', ['לא', 'כן'])}</div><div style="${S.box}">${esc(v.fwDifficultiesDetail)}</div></div>`,
  );
  blocks.push(
    `<div><div style="${S.row}"><span style="${S.lbl}">6. האם יש הלימה בין עבודת העו"ז לשביעות רצונו?</span>${opt('fwAlignment', ['כן', 'לא'])}<span style="${S.lbl}">חברים/מכרים באזור?</span>${opt('fwFriends', ['כן', 'לא'])}</div></div>`,
  );

  // תנאי העסקה
  blocks.push(
    `<div><div style="${S.sec}">תנאי העסקת העו"ז</div>` +
      `<div style="${S.row}"><span style="${S.lbl}">החוזה בידי:</span>${opt('contractHolder', ['המעסיק', 'העובד', 'אחר'])}<span style="${S.lbl}">תורגם לעו"ז?</span>${opt('contractTranslated', ['כן', 'לא'])}</div>` +
      `<div style="${S.row}">${fld('ביטוח רפואי תקף עד', v.insuranceUntil, 110)}${fld('חברת ביטוח', v.insuranceCompany, 120)}${fld('בטל"א שולם ב-', v.btlPaid, 100)}</div>` +
      `<div style="${S.row}">${fld('שכר חודשי', v.salary, 90)}${fld('מועד תשלום', v.payDate, 100)}<span style="${S.lbl}">בהפקדה?</span>${opt('deposited', ['כן', 'לא'])}${fld('יום חופשי שבועי', v.weeklyDayOff, 90)}</div>` +
      `<div style="${S.item}">מגורים הולמים לעו"ז</div><div style="${S.row}">${cl('housing', ['חדר', 'כלי מיטה', 'ארון', 'חימום', 'אוכל', 'אינטרנט', 'טלוויזיה'])}</div>` +
      `<div style="${S.item}">הערות</div><div style="${S.box}">${esc(v.termsNotes)}</div></div>`,
  );

  // תכנית טיפול
  blocks.push(
    `<div><div style="${S.sec}">תכנית טיפול</div>` +
      `<div style="${S.item}">מהות הטיפול</div><div style="${S.row}">${cl('treatmentType', ['טיפול בבעיות המעסיק', 'טיפול בבעיות העו"ז', 'גישור', 'מעקב', 'תיווך והפנייה לשירותים', 'דיווח לבן משפחה'])}</div>` +
      `<div style="${S.box}">${esc(v.treatmentDetail)}</div></div>`,
  );

  // סיכום
  blocks.push(
    `<div><div style="${S.sec}">סיכום והתרשמות מבצע/ת הביקור</div>` +
      `<div style="${S.item}">בנוגע למעסיק/ה</div><div style="${S.box}">${esc(v.summaryEmployer)}</div>` +
      `<div style="${S.item}">בנוגע למטפל/ת</div><div style="${S.box}">${esc(v.summaryCaregiver)}</div>` +
      `<div style="${S.row}"><span style="${S.lbl}">נוכחים בביקור:</span>${cl('attendees', ['מעסיק', 'בן משפחה', 'עו"ז', 'נציג לשכה פרטית', 'אחר'])}${fld('אחר', v.attendeesOther, 90)}</div></div>`,
  );

  // חתימות
  const sigCell = (label, inner) =>
    `<div style="flex:1;text-align:center;padding:0 6px;"><div style="min-height:46px">${inner}</div><div style="border-top:1px solid #333;margin-top:2px;padding-top:2px;font-weight:700;font-size:12px">${esc(label)}</div></div>`;
  blocks.push(
    `<div><div style="${S.sec}">אישור וחתימה</div>` +
      `<div style="font-size:12px;line-height:1.6;margin:2px 0 8px">אני הח"מ עו"ס ${fld('שם', v.performerName, 130)} ת.ז ${fld('', v.performerId, 100)} מאשר/ת כי ביצעתי את הביקור הנ"ל מטעם ${esc(COMPANY_NAME)} בהתאם לנוהל ולאתיקה המקצועית.</div>` +
      `<div style="display:flex;gap:8px;margin-bottom:12px">${sigCell('תאריך הביקור', `<div style="padding-top:20px">${fmtDate(v.performerDate)}</div>`)}${sigCell('שם מבצע/ת הביקור', `<div style="padding-top:20px">${esc(v.performerName)}</div>`)}${sigCell('חתימה – מבצע/ת', sig('performerSignature'))}</div>` +
      `<div style="font-size:12px;line-height:1.6;margin:2px 0 8px">הנני לאשר כי ביצעתי / קראתי את הדוח הנ"ל והביקור התבצע בהתאם לנהלים ולסטנדרטים המקצועיים.</div>` +
      `<div style="display:flex;gap:8px">${sigCell('שם עו"ס אחראי/ת', `<div style="padding-top:20px">${esc(v.seniorName)}</div>`)}${sigCell('ת.ז', `<div style="padding-top:20px">${esc(v.seniorId)}</div>`)}${sigCell('חתימה – עו"ס בכיר/ה', sig('seniorSignature'))}</div></div>`,
  );

  return htmlToPdf(blocks, { baseStyle: S.base });
}
