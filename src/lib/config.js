// Supabase project configuration.
// NOTE: the anon key is *meant* to be public — it ships in every Supabase web
// app and is protected by Row Level Security on the server. Never put the
// service_role key here.
export const SUPABASE_URL = 'https://dhrctqjxbdlwfxabinbr.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocmN0cWp4YmRsd2Z4YWJpbmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjM1MDUsImV4cCI6MjA5NzMzOTUwNX0.MlmRsagJbAVAwiKMZTBDQ8K1AVTB45EJzhdrZMR2fmY';

export const BUCKET = 'documents';

export const isConfigured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

// Public download URL of a signed document (the storage bucket is public).
export function signedPublicUrl(id) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/signed/${id}.pdf`;
}

// Public URL of one split part of a signed document (1-based index).
export function signedPartPublicUrl(id, index) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/signed/${id}-part${index}.pdf`;
}
