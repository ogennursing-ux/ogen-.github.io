// Golden test: rebuild the nursing-care file from the fields extracted out of
// the original sample and assert it matches the sample byte-for-byte.
//
//   node scripts/verify-siud.mjs
//
// The expected bytes below are the base64 of the original export
// `oz_siud_manot_216095568_90.txt`. If buildSiudFileBytes drifts, this fails.

import {
  buildSiudFileBytes,
  parseSiudFileBytes,
  bytesToBase64,
} from '../src/lib/bituachSiudFile.js';

const EXPECTED_B64 =
  'NTAwMjE2MDk1NTY4MDkwMjAyMzE1RkEwODEwOTQ0ICAgICAgCUtPQklMT1YgICAgICAgICAgICAJRk9SSUdKT04gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCffl4ens5eEgICAgICAgICAgIAn05fjp4mDl7zExOTg5MTAxMjIwMDU1ICA5NzQ3ODA3MDAyMDI2MDQzMDEwMjY5MjM4NjIgICAgICAgICAgICAgICAgICAgICAgICAgICAgIODl7Ong7CAgICAgICAgICAgICAgIOnk5ePkMTE5NDE1MDAwICAgICAgICAgICAgICAgICD67CDg4enhIC0g6fTlICAgICDj6fjkIO7w5+0g4Pjh5CAgICAgMTAgICAgIDA1NDc4MjQ2NTIgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAwMCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICANCjUwMDIxNjA5NTU2ODA5OTkwMDAxDQo=';

// The person-specific fields as they appear in the sample.
const record = {
  id: '216095568',
  lastNameLatin: 'KOBILOV',
  firstNameLatin: 'FORIGJON',
  lastNameHebrew: 'קובילוב',
  firstNameHebrew: 'פוריג`ון',
  birthDate: '19891012',
  city: 'תל אביב - יפו',
  street: 'דירה מנחם ארבה',
  house: '10',
  phone: '0547824652',
};

const got = bytesToBase64(buildSiudFileBytes(record));

if (got !== EXPECTED_B64) {
  console.error('❌ MISMATCH — generated file does not equal the sample.');
  // Show first differing byte to aid debugging.
  const a = atob(got), b = atob(EXPECTED_B64);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      console.error(`first diff at byte ${i}: got ${a.charCodeAt(i)} expected ${b.charCodeAt(i)}`);
      break;
    }
  }
  console.error(`lengths: got ${a.length}, expected ${b.length}`);
  process.exit(1);
}

console.log('✅ byte-exact: generated file equals the original sample (%d bytes)', atob(got).length);

// Round-trip: parse the file back and confirm the readable fields. Latin
// fields (id/names in Latin, digits) are upper-cased on write, so compare
// against the upper-cased expectation.
const ASCII_FIELDS = ['id', 'lastNameLatin', 'firstNameLatin', 'birthDate', 'house', 'phone'];
const parsed = parseSiudFileBytes(buildSiudFileBytes(record));
let ok = true;
for (const k of Object.keys(record)) {
  const want = ASCII_FIELDS.includes(k) ? String(record[k]).toUpperCase() : record[k];
  if (parsed[k] !== want) {
    console.error(`  parse mismatch ${k}: got ${JSON.stringify(parsed[k])} want ${JSON.stringify(want)}`);
    ok = false;
  }
}
console.log(ok ? '✅ parse round-trip: all readable fields recovered' : '⚠️  parse round-trip had mismatches (see above)');
process.exit(ok ? 0 : 1);
