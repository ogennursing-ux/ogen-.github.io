// Supabase Edge Function: telegram-webhook
// -----------------------------------------------------------------------------
// The bridge that makes the Telegram agent work. Telegram blocks browsers from
// reading bot messages directly (CORS), so instead Telegram PUSHES each update
// to this function (a webhook). Here, server-side (no CORS limits), we:
//   1. read the message text and/or download the photo,
//   2. extract the fields with Groq (the key stays here, secure — not in the
//      browser),
//   3. insert a ready submission into the `agent_submissions` table,
// and the app's "📥 הגשות" inbox shows it for one-click import.
//
// Deploy: Supabase Dashboard → Edge Functions → create "telegram-webhook",
// paste this, deploy, and turn OFF "Verify JWT". Set secrets TELEGRAM_TOKEN and
// GROQ_KEY. Then point the bot at it (see the setWebhook URL in the chat guide).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TG = Deno.env.get("TELEGRAM_TOKEN") ?? "";
const GROQ_KEY = Deno.env.get("GROQ_KEY") ?? "";
const GROQ_VISION = Deno.env.get("GROQ_VISION_MODEL") ?? "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_TEXT = Deno.env.get("GROQ_TEXT_MODEL") ?? "llama-3.3-70b-versatile";

// A broad key set covering both a worker (passport) and a patient/family (ID),
// so the app can import the same submission as either type.
const KEYS = [
  "nameHe", "nameEn", "passportNo", "nationality", "dob", "gender", "fullName",
  "idNumber", "city", "street", "phone", "email", "contactName", "contactMobile",
  "visaExpiry", "permitExpiry", "insuranceExpiry",
];

async function groq(messages: unknown, model: string): Promise<Record<string, unknown>> {
  if (!GROQ_KEY) return {};
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model, messages, temperature: 0, response_format: { type: "json_object" } }),
  });
  if (!r.ok) return {};
  const d = await r.json();
  try { return JSON.parse(d?.choices?.[0]?.message?.content ?? "{}"); } catch { return {}; }
}

function readImage(b64: string) {
  const prompt =
    `Read this scanned Israeli ID (ת"ז) / passport / permit. It may be printed or handwritten. ` +
    `Return ONLY a JSON object with these keys: ${KEYS.join(", ")}. ` +
    `Empty string if a field is missing. Dates as YYYY-MM-DD. gender: 'ז' for male, 'נ' for female.`;
  return groq(
    [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }] }],
    GROQ_VISION,
  );
}
function readText(text: string) {
  const prompt =
    `Extract foreign-worker or patient details from this Hebrew text. ` +
    `Return ONLY a JSON object with these keys: ${KEYS.join(", ")}. Empty string if missing. Dates YYYY-MM-DD. ` +
    `Text: """${text}"""`;
  return groq([{ role: "user", content: prompt }], GROQ_TEXT);
}
function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

Deno.serve(async (req) => {
  try {
    const update = await req.json();
    const m = update.message ?? update.channel_post ?? update.edited_message;
    if (!m) return new Response("ok");
    const text: string = m.text ?? m.caption ?? "";
    let data: Record<string, unknown> = {};

    if (Array.isArray(m.photo) && m.photo.length && GROQ_KEY && TG) {
      const fileId = m.photo[m.photo.length - 1].file_id; // largest size
      const info = await (await fetch(`https://api.telegram.org/bot${TG}/getFile?file_id=${fileId}`)).json();
      const path = info?.result?.file_path;
      if (path) {
        const img = await fetch(`https://api.telegram.org/file/bot${TG}/${path}`);
        data = await readImage(toB64(await img.arrayBuffer()));
      }
    } else if (text) {
      data = await readText(text);
    }
    if (text) data.notes = [data.notes, text].filter(Boolean).join("\n");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    await sb.from("agent_submissions").insert({ kind: "worker", data, source: "telegram", status: "new" });
    return new Response("ok");
  } catch (e) {
    // Always 200 so Telegram does not retry-storm the webhook.
    return new Response("handled: " + (e as Error).message);
  }
});
