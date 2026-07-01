import { createContext, useContext } from 'react';

// Translation strategy: the Hebrew string is the key. In Hebrew we return it
// as-is; in English we look it up in EN (falling back to the Hebrew if missing).
// Use {placeholders} for dynamic parts: t('שלום {name}', { name }).
const EN = {
  // brand / header
  'חתימה דיגיטלית': 'Digital Signature',
  '⚙ הגדרות': '⚙ Settings',

  // dropzone / home
  'שליחת מסמך לחתימה': 'Send a document for signing',
  'העלה PDF, מקם שדות חתימה, ושלח קישור — או שמור כתבנית לשימוש חוזר.':
    'Upload a PDF, place signing fields, and send a link — or save a reusable template.',
  'טוען מסמך…': 'Loading document…',
  'גרור לכאן קובץ PDF': 'Drag a PDF here',
  'או בחר קובץ מהמכשיר': 'or choose a file from your device',
  'בחר קובץ PDF': 'Choose PDF file',
  '🔒 הקבצים נשמרים באופן מאובטח ומשמשים אך ורק לתהליך החתימה.':
    '🔒 Files are stored securely and used only for the signing process.',
  'שליחה רגילה': 'Single signer',
  'סבב חתימות (2 חותמים)': 'Signing round (2 signers)',

  // toolbar / editor
  'מסמך חדש': 'New document',
  'שמור כתבנית': 'Save as template',
  'צור קישור לחתימה ›': 'Create signing link ›',
  'המשך לחתימה ›': 'Continue to signing ›',
  'שם המסמך:': 'Document name:',
  'שם המסמך': 'Document name',
  'הוסף חותם שני': '+ Add second signer',
  '+ הוסף חותם שני': '+ Add second signer',
  'מייל (לא חובה)': 'Email (optional)',
  'מייל החותם (לא חובה):': "Signer's email (optional):",
  'שדות חדשים משויכים ל: {name}': 'New fields assigned to: {name}',
  'שם חותם {i}': 'Signer {i}',
  'הוסף {label}': 'Add {label}',
  'שדה': 'Field',
  'לחץ על המסמך כדי למקם {label}': 'Click the document to place {label}',
  'בחר סוג שדה מהסרגל למעלה ולחץ על המסמך כדי להוסיף שדה שהחותם ימלא':
    'Pick a field type above, then click the document to add a field the signer fills',

  // field labels
  חתימה: 'Signature',
  'שם פרטי': 'First name',
  'שם משפחה': 'Last name',
  'שם מלא': 'Full name',
  'תעודת זהות': 'ID number',
  טקסט: 'Text',
  תאריך: 'Date',
  'תיבת סימון': 'Checkbox',
  'ראשי תיבות': 'Initials',

  // edit panel
  'שייך ל:': 'Assign to:',
  'השדה ימולא על־ידי החותם דרך הקישור.': 'This field is filled by the signer via the link.',
  'שדה חובה': 'Required field',
  שכפל: 'Duplicate',
  'מחק שדה': 'Delete field',

  // dashboard
  'המסמכים שלי': 'My documents',
  'חיפוש…': 'Search…',
  'הצג {n}': 'Show {n}',
  'חדש → ישן': 'Newest → oldest',
  'ישן → חדש': 'Oldest → newest',
  'לפי שם': 'By name',
  'לפי סטטוס': 'By status',
  הכל: 'All',
  ממתינים: 'Pending',
  נחתמו: 'Signed',
  'בחר הכל': 'Select all',
  'ייצוא Excel/CSV': 'Export Excel/CSV',
  'הורדה מרוכזת': 'Download merged',
  מחק: 'Delete',
  נחתם: 'Signed',
  הצג: 'View',
  הורד: 'Download',
  'לא נמצא': 'Not found',
  'ממתין לחותם {c}/{t}': 'Waiting for signer {c}/{t}',
  'ממתין לחתימה': 'Awaiting signature',
  קישור: 'Link',
  'טוען…': 'Loading…',
  'להסיר {n} מסמכים מהרשימה?': 'Remove {n} documents from the list?',
  'בחר מסמכים חתומים להורדה מרוכזת.': 'Select signed documents for a merged download.',
  'מסמך': 'Document',

  // templates
  'התבניות שלי': 'My templates',
  תבנית: 'Template',
  'העתק לינק קבוע': 'Copy permanent link',
  'קישור חד-פעמי': 'One-time link',
  חתימות: 'Signatures',
  'עדיין אין חתימות.': 'No signatures yet.',
  'נוצר קישור חד-פעמי חדש והועתק. שלח אותו לחותם.':
    'A new one-time link was created and copied. Send it to the signer.',
  'למחוק את התבנית? קישורים קבועים שלה יפסיקו לעבוד.':
    'Delete this template? Its permanent links will stop working.',

  // settings
  הגדרות: 'Settings',
  'להפעלת שליחה אוטומטית במייל (קישור לחותם + המסמך החתום אליך) — חבר webhook של Make.':
    'To enable automatic emails (link to the signer + the signed document to you) — connect a Make webhook.',
  'המייל שלך (לקבלת מסמכים חתומים)': 'Your email (to receive signed documents)',
  'כתובת ה-Webhook של Make': 'Make webhook URL',
  שמור: 'Save',

  // signature pad
  ציור: 'Draw',
  הקלדה: 'Type',
  'צייר את חתימתך באמצעות העכבר או האצבע': 'Draw your signature with the mouse or finger',
  'הקלד את שמך': 'Type your name',
  נקה: 'Clear',
  'שמור חתימה': 'Save signature',

  // sign flow
  'תור החתימה: {name}': 'Signing turn: {name}',
  'מילוי וחתימה': 'Fill and sign',
  'חותם {c} מתוך {n}': 'signer {c} of {n}',
  'מלא את הפרטים פעם אחת — הם יופיעו בכל המקומות במסמך':
    'Fill in your details once — they appear everywhere in the document',
  'אני מאשר/ת': 'I confirm',
  'אישור {i}': 'Confirmation {i}',
  'טקסט {i}': 'Text {i}',
  'תאריך {i}': 'Date {i}',
  'פתח לוח חתימה': 'Open signature pad',
  'חתום מחדש': 'Sign again',
  'סיים ושלח חתימה': 'Finish and submit',
  'שולח…': 'Submitting…',
  'יש למלא {n} שדות חובה לפני השליחה.': 'Please fill {n} required fields before submitting.',
  'נשארו {n} שדות חתימה ריקים. לשלוח בכל זאת?': '{n} signature fields are empty. Submit anyway?',

  // signer / form result screens
  'לא ניתן לפתוח את המסמך': 'Could not open the document',
  'המסמך כבר נחתם': 'This document is already signed',
  'אפשר להוריד עותק חתום.': 'You can download a signed copy.',
  'הורד מסמך חתום': 'Download signed document',
  'מוריד…': 'Downloading…',
  'תודה! החתימה הושלמה': 'Thank you! Signing complete',
  'המסמך החתום נשמר ונשלח לשולח הבקשה.': 'The signed document was saved and sent to the requester.',
  'הורד עותק חתום': 'Download signed copy',
  'תודה! החתימה נשמרה': 'Thank you! Your signature was saved',
  'המסמך הועבר לחתימת {name}.': 'The document was passed to {name} for signing.',
  'תודה! החתימה נשלחה': 'Thank you! Your signature was submitted',
  'העותק החתום נשמר ונשלח לשולח.': 'The signed copy was saved and sent to the sender.',
  'חתום על עותק נוסף': 'Sign another copy',

  // link created
  'הקישור לחתימה מוכן!': 'Your signing link is ready!',
  'התבנית נשמרה! הנה הלינק הקבוע': 'Template saved! Here is the permanent link',
  'שלח את הקישור לחותם. ברגע שהוא יחתום, המסמך החתום יחכה לך ב"המסמכים שלי".':
    'Send the link to the signer. Once signed, the document waits for you in "My documents".',
  'שלח את הקישור לחותם הראשון. אחרי שיחתום — שלח את אותו קישור לחותם השני. בסיום המסמך החתום יחכה לך ב"המסמכים שלי".':
    'Send the link to the first signer. After they sign, send the same link to the second. When done, the signed document waits in "My documents".',
  'כל מי שתשלח לו את הלינק הזה יוכל לחתום — וכל חתימה תישמר בנפרד ב"התבניות שלי".':
    'Anyone you send this link to can sign — each signature is stored separately under "My templates".',
  העתק: 'Copy',
  'הועתק!': 'Copied!',
  'שלח במייל': 'Send by email',
  'שלח בוואטסאפ': 'Send on WhatsApp',

  // login
  'כניסה למערכת': 'Sign in',
  'שם משתמש': 'Username',
  סיסמה: 'Password',
  התחבר: 'Log in',
  'שם משתמש או סיסמה שגויים': 'Wrong username or password',
  'התנתק': 'Log out',

  // document name step
  'איך לקרוא למסמך?': 'What should we call the document?',
  'המשך לעריכה': 'Continue to editor',

  // all signatures + notifications
  'כל החתימות במערכת': 'All signatures',
  'אין עדיין חתימות במערכת.': 'No signatures yet.',
  'חתימות חדשות: {n}': 'New signatures: {n}',
  'הוספת שדות': 'Add fields',
  תבניות: 'Templates',
  'אין תבניות שמורות עדיין.': 'No saved templates yet.',
  שאלה: 'Question',
  'מה לשאול את החותם?': 'What to ask the signer?',
  'הודעה לחותם (לא תופיע במסמך)': 'Message to the signer (not shown in the document)',
  'דפים (למשל 1-3,5)': 'Pages (e.g. 1-3,5)',
  'הורד דפים נבחרים': 'Download selected pages',
  'הורד הכל': 'Download all',
  'כמה מסמכים אוחדו לאחד': 'Multiple documents were merged into one',

  // pdf preview
  'תצוגה מקדימה': 'Preview',
  'טוען תצוגה…': 'Loading preview…',
  'הורד מסמך': 'Download document',
};

export const LangContext = createContext({ lang: 'he', setLang: () => {} });

export function getInitialLang() {
  try {
    return localStorage.getItem('lang') || 'he';
  } catch {
    return 'he';
  }
}

export function applyLang(lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
}

export function translate(lang, s, vars) {
  let str = lang === 'en' ? EN[s] ?? s : s;
  if (vars) for (const k in vars) str = str.split('{' + k + '}').join(vars[k]);
  return str;
}

export function useT() {
  const { lang } = useContext(LangContext);
  return (s, vars) => translate(lang, s, vars);
}

export function useLang() {
  return useContext(LangContext);
}
