// Contract template mapper.
//
// The office uploads its OWN contract (.docx) with placeholders like {{...}}.
// We scan it, list the placeholders it contains, and let the office bind each
// one to a field in the system (worker / patient / company). The binding is
// saved, so from then on the contract fills itself for any case.
//
// Built on the existing merge engine: the placeholders can be named anything
// (including Hebrew), and each maps to one of the known source keys that
// buildValueMap already knows how to resolve.
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { recordsFromChat } from './chatRecords.js';
import { buildValueMap, WORKER_KEYS, PATIENT_KEYS, CONTRACT_FIELD_LABELS } from './contractMerge.js';
import { COMPANY_NAME } from '../lib/workerPortal.js';

const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';
let _sb;
const sb = () => (_sb || (_sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)));

// The catalog of fields a placeholder can be bound to, with Hebrew labels.
export const SOURCE_FIELDS = [
  { group: 'עובד/ת', keys: WORKER_KEYS },
  { group: 'מטופל/משפחה', keys: PATIENT_KEYS },
  { group: 'כללי', keys: ['today', 'companyName'] },
].map((g) => ({ ...g, keys: g.keys.map((k) => ({ key: k, label: CONTRACT_FIELD_LABELS[k] || k })) }));

const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

// Combine the runs of each paragraph (Word splits typed text), so a placeholder
// spread across runs is still seen whole.
function paragraphsText(xml) {
  const out = [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paras = doc.getElementsByTagName('w:p');
  for (let i = 0; i < paras.length; i++) {
    const texts = paras[i].getElementsByTagName('w:t');
    let s = '';
    for (let j = 0; j < texts.length; j++) s += texts[j].textContent;
    if (s) out.push(s);
  }
  return out;
}

const PART_RE = /^word\/(document|header\d*|footer\d*)\.xml$/;

// Every distinct {{placeholder}} in the uploaded .docx.
export async function scanDocxTokens(fileBuf) {
  const buf = fileBuf instanceof Blob ? await fileBuf.arrayBuffer() : fileBuf;
  const zip = await JSZip.loadAsync(buf);
  const found = new Set();
  for (const name of Object.keys(zip.files).filter((n) => PART_RE.test(n))) {
    const xml = await zip.file(name).async('string');
    for (const line of paragraphsText(xml)) {
      let m;
      TOKEN.lastIndex = 0;
      while ((m = TOKEN.exec(line))) found.add(m[1].trim());
    }
  }
  return [...found];
}

// Replace {{token}} across a part, using a token→value map, combining runs.
function fillXml(xml, tokenValues) {
  if (xml.indexOf('{{') === -1) return xml;
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paras = doc.getElementsByTagName('w:p');
  for (let i = 0; i < paras.length; i++) {
    const texts = paras[i].getElementsByTagName('w:t');
    if (!texts.length) continue;
    let combined = '';
    for (let j = 0; j < texts.length; j++) combined += texts[j].textContent;
    if (combined.indexOf('{{') === -1) continue;
    const replaced = combined.replace(TOKEN, (whole, raw) => {
      const k = raw.trim();
      return Object.prototype.hasOwnProperty.call(tokenValues, k) ? tokenValues[k] : whole;
    });
    texts[0].textContent = replaced;
    texts[0].setAttribute('xml:space', 'preserve');
    for (let j = 1; j < texts.length; j++) texts[j].textContent = '';
  }
  return new XMLSerializer().serializeToString(doc);
}

// Fill an uploaded template (by its stored mapping) for one case → filled .docx.
export async function fillTemplateForCase(tpl, caseObj) {
  const { worker, family } = recordsFromChat(caseObj?.data?.fields || {});
  const values = buildValueMap({ worker, family }, { companyName: COMPANY_NAME });
  const tokenValues = {};
  for (const [token, srcKey] of Object.entries(tpl.mapping || {})) {
    if (!srcKey) continue; // unmapped → leave the placeholder as-is
    tokenValues[token] = values[srcKey] != null ? String(values[srcKey]) : '';
  }
  const buf = base64ToBytes(tpl.docxBase64).buffer;
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files).filter((n) => PART_RE.test(n))) {
    const xml = await zip.file(name).async('string');
    zip.file(name, fillXml(xml, tokenValues));
  }
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---- base64 <-> bytes -----------------------------------------------------------
export function bytesToBase64(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- storage (Supabase; kept out of the cases list via kind='config') ----------
const isTpl = (r) => r?.data?.configType === 'contract_template';
const shape = (r) => ({ id: r.id, name: r.data?.name || 'תבנית', mapping: r.data?.mapping || {}, docxBase64: r.data?.docxBase64 || '', tokens: r.data?.tokens || [], updatedAt: r.data?.updatedAt });

export async function listTemplates() {
  const { data, error } = await sb().from('agent_submissions').select('*').eq('kind', 'config').limit(200);
  if (error) throw new Error('טעינת התבניות נכשלה: ' + error.message);
  return (data || []).filter(isTpl).map(shape).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function saveTemplate({ id, name, docxBase64, mapping, tokens }) {
  const data = { configType: 'contract_template', name, docxBase64, mapping, tokens, updatedAt: Date.now() };
  if (id) {
    const { error } = await sb().from('agent_submissions').update({ data }).eq('id', id);
    if (error) throw new Error('שמירת התבנית נכשלה: ' + error.message);
    return id;
  }
  const { data: row, error } = await sb().from('agent_submissions').insert({ kind: 'config', status: 'template', data }).select('id').single();
  if (error) throw new Error('שמירת התבנית נכשלה: ' + error.message);
  return row.id;
}

export async function deleteTemplate(id) {
  const { error } = await sb().from('agent_submissions').delete().eq('id', id);
  if (error) throw new Error('מחיקת התבנית נכשלה: ' + error.message);
}
