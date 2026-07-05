// Supabase Edge Function: turn extracted person fields into the National
// Insurance nursing-care ("סיעוד") file. Make.com calls this over HTTP inside
// the Telegram automation (see docs/telegram-siud-automation.md).
//
// Deploy:  supabase functions deploy generate-siud --no-verify-jwt
//
// Request  (POST, application/json):
//   { "id":"216095568", "lastNameLatin":"KOBILOV", "firstNameLatin":"FORIGJON",
//     "lastNameHebrew":"קובילוב", "firstNameHebrew":"פוריג`ון",
//     "birthDate":"19891012", "city":"תל אביב - יפו",
//     "street":"דירה מנחם ארבה", "house":"10", "phone":"0547824652" }
//
// Response (JSON):
//   { "filename":"oz_siud_manot_216095568_90.txt", "base64":"...", "bytes":728 }
//   Add ?raw=1 to get the ISO-8859-8 file itself as an attachment instead.
//
// NOTE on imports: this reuses the canonical generator in src/lib. If the
// Supabase CLI refuses to bundle a file outside supabase/functions, copy it in:
//   cp src/lib/bituachSiudFile.js supabase/functions/generate-siud/bituachSiudFile.js
// and change the import below to "./bituachSiudFile.js".

// deno-lint-ignore-file no-explicit-any
import {
  buildSiudFileBytes,
  buildSiudFileBase64,
  siudFileName,
} from '../../../src/lib/bituachSiudFile.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return json({ error: 'POST a JSON record' }, 405);
  }

  let record: any;
  try {
    record = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  try {
    const batch = record.batch || '90';
    const filename = siudFileName(record.id, batch);

    if (new URL(req.url).searchParams.get('raw') === '1') {
      const bytes = buildSiudFileBytes(record);
      return new Response(bytes, {
        status: 200,
        headers: {
          ...CORS,
          // ISO-8859-8 is the on-disk encoding expected by the ביטוח לאומי system.
          'Content-Type': 'text/plain; charset=iso-8859-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return json({
      filename,
      base64: buildSiudFileBase64(record),
      bytes: buildSiudFileBytes(record).length,
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
