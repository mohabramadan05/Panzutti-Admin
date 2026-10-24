import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local");
}

/**
 * The one browser client for the whole panel. It keeps the staff member's session, and every
 * read/write goes through Row Level Security and the staff/admin RPCs, so the database itself
 * decides what each role may see or change. Only the public (publishable) key lives here.
 */
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "panzutti-admin-auth" },
});
