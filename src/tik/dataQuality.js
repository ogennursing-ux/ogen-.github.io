// Data-quality scan. Proactively finds the mistakes that quietly break things
// later — a mistyped ID, a start date after the end date, the same passport in
// two files, a placement missing a critical field. Rule-based on purpose, so a
// flag is always trustworthy (no AI guessing here).
import { activePlacements } from './registry.js';

const DAY = 86400000;
const parseDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
const digitsOf = (v) => String(v ?? '').replace(/\D/g, '');

// The standard Israeli ID (ת"ז) check-digit algorithm.
export function validIsraeliId(id) {
  const s = digitsOf(id);
  if (!s || s.length > 9) return false;
  const p = s.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(p[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

// severity: 'critical' | 'warning'
function issue(list, severity, kind, caseObj, text) {
  list.push({ severity, kind, caseObj, id: caseObj?.id, text });
}

export function computeIssues(cases) {
  const list = [];
  const active = activePlacements(cases);
  const activeIds = new Set(active.map((c) => c.id));

  // Same passport in more than one file → probably a duplicate or a typo.
  const byPassport = new Map();
  for (const c of cases) {
    const pass = String(c.worker?.passportNo || '').trim().toUpperCase();
    if (pass.length < 4) continue; // passports are alphanumeric — don't strip letters
    (byPassport.get(pass) || byPassport.set(pass, []).get(pass)).push(c);
  }
  for (const [pass, group] of byPassport) {
    if (group.length > 1) {
      for (const c of group) issue(list, 'critical', 'worker', c, `דרכון ${pass} מופיע ב-${group.length} תיקים — כפילות אפשרית`);
    }
  }

  for (const c of cases) {
    const f = c.data?.fields || {};
    const w = c.worker || {};
    const fam = c.family || {};
    const isActive = activeIds.has(c.id);

    // Employer ID checksum.
    const empId = digitsOf(fam.idNumber);
    if (empId && empId.length >= 5 && empId.length <= 9 && !validIsraeliId(empId)) {
      issue(list, 'warning', 'family', c, `ת"ז מעסיק ${fam.idNumber} אינה עוברת בדיקת ספרת ביקורת`);
    }

    // Placement date order.
    const ps = parseDate(f.placementStartDate || f.startDate);
    const pe = parseDate(f.placementEndDate);
    if (ps && pe && ps > pe) {
      issue(list, 'critical', 'worker', c, 'תאריך תחילת עבודה מאוחר מתאריך הסיום');
    }

    // Impossible birth date / age.
    const dob = parseDate(w.dob);
    if (dob) {
      const age = (Date.now() - dob) / (DAY * 365.25);
      if (dob > new Date()) issue(list, 'warning', 'worker', c, 'תאריך לידת העובד/ת בעתיד');
      else if (age > 100 || age < 16) issue(list, 'warning', 'worker', c, `גיל העובד/ת חריג (${Math.floor(age)})`);
    }

    // Missing critical fields on an ACTIVE placement.
    if (isActive) {
      if (!w.passportNo) issue(list, 'warning', 'worker', c, 'השמה פעילה ללא מספר דרכון');
      if (!empId) issue(list, 'warning', 'family', c, 'השמה פעילה ללא ת"ז מעסיק');
      if (!(fam.coordinator || f.coordinator)) issue(list, 'warning', 'family', c, 'השמה פעילה ללא רכז/ת');
    }
  }

  const order = { critical: 0, warning: 1 };
  list.sort((a, b) => order[a.severity] - order[b.severity]);
  return list;
}
