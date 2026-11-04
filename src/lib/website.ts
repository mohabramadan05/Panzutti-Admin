import { supabase } from "./supabase";

export const WEBSITE_URL = (process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://panzutti.com").replace(/\/$/, "");

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Tell the public website to drop its cached pages so menu changes show up right away
 * (otherwise they appear after the site's 5-minute revalidate window). Calls are debounced,
 * and a failure never blocks the admin — the site still catches up on its own.
 */
export function refreshWebsite() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      const res = await fetch(`${WEBSITE_URL}/api/revalidate`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) console.warn("[website] refresh failed:", res.status, await res.text());
    } catch (e) {
      console.warn("[website] refresh failed:", (e as Error).message);
    }
  }, 800);
}
