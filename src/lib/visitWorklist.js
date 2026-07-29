// Bridge between the office file-cabinet (the "tik" system) and the social
// worker portal. The office fills every family/worker file; here we read those
// same records, work out which placements are due for a home visit, and turn a
// case into the values that pre-fill the visit forms — so the social worker
// sees who to visit and never re-types details the office already has.
//
// The visit schedule rules live in ONE place (../tik/socialWorker.js), reused
// here, so the portal and the office always agree on what is due.
import { loadRegistry, activePlacements } from '../tik/registry.js';
import { buildVisitReport, quarterOptions, VISIT_KINDS, saveVisit } from '../tik/socialWorker.js';

export { VISIT_KINDS, quarterOptions };

const isoToday = () => new Date().toISOString().slice(0, 10);

// Record a portal-submitted visit back onto the office file, so the office sees
// it as done. The visit date comes from the form (falling back to today); the
// home-visit form has no channel field, so mark it a physical visit.
export async function markVisitDone(caseObj, visitId, dateStr, note) {
  if (!caseObj || !visitId) return;
  await saveVisit(caseObj, visitId, dateStr || isoToday(), note || '', 'physical');
}

// Every open (not-yet-done) visit across all active placements, soonest first,
// with overdue ones surfaced at the top — this is the social worker's worklist.
export async function loadVisitWorklist() {
  const cases = await loadRegistry();
  const rows = buildVisitReport(activePlacements(cases));
  const open = rows.filter((v) => !v.done);
  open.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1; // overdue first
    return a.due - b.due;
  });
  return open;
}

// ---- form pre-fill -------------------------------------------------------------

// Only inject a value into a <select> when it is one of the field's own options;
// otherwise the office's wording wouldn't match and the control would break.
const pick = (value, options) => (options.includes(value) ? value : undefined);

// A scheduled visit kind → the wording used in the ביקור בית form's סוג ביקור.
const VISIT_TYPE = { placement: 'הכרות / רישום', day30: 'לאחר', periodic: 'שוטף' };

// The office records the placement in several ways; collapse them to the two
// options the form offers.
function placementSide(f) {
  const t = f.placementType || '';
  if (t === 'השמה מחו״ל' || t === 'השמה מחול') return 'מחו"ל';
  if (t === 'השמה מהארץ' || t === 'העברה מלשכה אחרת' || t === 'החלפה' || t === 'הארכה') return 'מהארץ';
  if (f.placementFromIsrael === 'לא') return 'מחו"ל';
  if (f.placementFromIsrael === 'כן') return 'מהארץ';
  return undefined;
}

const firstToken = (s) => String(s || '').trim().split(/\s+/)[0] || '';
const restTokens = (s) => String(s || '').trim().split(/\s+/).slice(1).join(' ');

// Drop empty/undefined so defaults on the form (e.g. our company name) survive.
const clean = (obj) => Object.fromEntries(
  Object.entries(obj).filter(([, v]) => v != null && v !== ''),
);

// טופס ב' – ביקור בית: employer + foreign-worker details straight from the file.
function homeVisitPrefill(c, visit) {
  const f = c.data?.fields || {};
  const fam = c.family || {};
  const wk = c.worker || {};
  return clean({
    visitType: VISIT_TYPE[visit?.kind?.key],
    empName: fam.fullName || f.employerName,
    empId: fam.idNumber,
    empAddress: [fam.street, fam.city].filter(Boolean).join(', '),
    empPhone: fam.phone,
    empContact: fam.contactName,
    empRelation: fam.contactRelation,
    empMobile: fam.mobile || fam.contactMobile,
    fwName: wk.nameEn || wk.nameHe,
    fwPassport: wk.passportNo,
    fwMobile: wk.phone,
    fwCountry: wk.nationality,
    fwStart: wk.startDate || f.placementStartDate || fam.placementStart,
    fwPlacement: placementSide(f),
    fwAgency: wk.overseasAgency,
    fwCity: wk.addrCity,
    fwStreet: wk.addrStreet,
    fwDayOff: wk.weeklyDayOff,
    salary: wk.salary,
    weeklyDayOff: wk.weeklyDayOff,
  });
}

// דו"ח טרום השמה: the patient's personal, address and contact details.
function preplacementPrefill(c) {
  const f = c.data?.fields || {};
  const fam = c.family || {};
  const GENDERS = ['זכר', 'נקבה'];
  const MARITAL = ['רווק/ה', 'נשוי/אה', 'אלמן/ה', 'פרוד/ה', 'גרוש/ה', 'ידוע/ה בציבור'];
  const REL = ['הורה', 'בן/בת', 'אח/ות', 'בן/ת זוג', 'אפוטרופוס', 'אחר'];
  return clean({
    pLastName: fam.lastName || restTokens(fam.fullName) || fam.fullName,
    pFirstName: fam.firstName || firstToken(fam.fullName),
    pId: fam.idNumber,
    pBirthDate: fam.dob,
    pSex: pick(fam.gender, GENDERS),
    pMobile: fam.mobile || fam.phone,
    pPhone: fam.phone,
    pEmail: fam.email,
    pCountry: fam.birthCountry,
    pLanguages: fam.language,
    pMaritalStatus: pick(fam.maritalStatus, MARITAL),
    aStreet: fam.street,
    aCity: fam.city,
    contactRel: pick(fam.contactRelation, REL),
    contactLast: restTokens(fam.contactName),
    contactFirst: firstToken(fam.contactName),
    contactMobile: fam.contactMobile,
  });
}

// Build the pre-fill for a given built-in form key from a case + its due visit.
export function prefillFor(formKey, caseObj, visit) {
  if (!caseObj) return null;
  if (formKey === 'homeVisit') return homeVisitPrefill(caseObj, visit);
  if (formKey === 'preplacement') return preplacementPrefill(caseObj);
  return null;
}
