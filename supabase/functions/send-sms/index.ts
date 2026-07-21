// Supabase Edge Function: send an SMS with a signing link.
//
// Called by the office app when both intake halves are ready. The provider API
// key stays here as a function secret — never in the public site.
//
// Deploy:
//   supabase functions deploy send-sms --no-verify-jwt
// Set secrets (Twilio example):
//   supabase secrets set SMS_PROVIDER=twilio \
//     TWILIO_SID=ACxxxx TWILIO_TOKEN=xxxx TWILIO_FROM=+972xxxxxxxxx
// Or an Israeli gateway (019 / InforU) — see the `israeli` branch below.
//
// Request body: { "to": "+9725xxxxxxxx", "text": "..." }  (or { to, link, name })

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalizeIL(phone: string): string {
  let p = String(phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('0')) p = '+972' + p.slice(1);
  else if (p.startsWith('972')) p = '+' + p;
  else if (!p.startsWith('+')) p = '+972' + p;
  return p;
}

async function sendTwilio(to: string, text: string) {
  const sid = Deno.env.get('TWILIO_SID');
  const token = Deno.env.get('TWILIO_TOKEN');
  const from = Deno.env.get('TWILIO_FROM');
  if (!sid || !token || !from) throw new Error('Twilio secrets missing');
  const body = new URLSearchParams({ To: to, From: from, Body: text });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error('Twilio: ' + (await res.text()));
  return await res.json();
}

// Israeli gateway (019 / InforU / SMS4Free style — a simple HTTP endpoint that
// takes user/pass/from/to/message). Set SMS_URL + SMS_USER + SMS_PASS + SMS_FROM.
async function sendIsraeli(to: string, text: string) {
  const url = Deno.env.get('SMS_URL');
  const user = Deno.env.get('SMS_USER');
  const pass = Deno.env.get('SMS_PASS');
  const from = Deno.env.get('SMS_FROM') || 'Ogen';
  if (!url || !user || !pass) throw new Error('Israeli SMS secrets missing');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user, pass, sender: from, recipient: to, message: text }),
  });
  if (!res.ok) throw new Error('SMS gateway: ' + (await res.text()));
  return await res.text();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const { to, text, link, name } = await req.json();
    if (!to) throw new Error('missing "to"');
    const message = text
      || `שלום${name ? ' ' + name : ''}, החוזה מוכן לחתימה. אנא חתמו כאן: ${link}\nעוגן סיעוד`;
    const target = normalizeIL(to);
    const provider = (Deno.env.get('SMS_PROVIDER') || 'twilio').toLowerCase();
    const result = provider === 'israeli' ? await sendIsraeli(target, message) : await sendTwilio(target, message);
    return new Response(JSON.stringify({ ok: true, to: target, result }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
