import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = "Africa/Cairo";

/** Prices are integer piasters (1 EGP = 100). */
export function egp(piasters: number | null | undefined) {
  const v = (piasters ?? 0) / 100;
  return `EGP ${v.toLocaleString("en-EG", { maximumFractionDigits: v % 1 === 0 ? 0 : 2 })}`;
}

export function time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function dateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function ago(iso: string, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ${min % 60} min ago` : dateTime(iso);
}

/** YYYY-MM-DD in Cairo time, for the report RPCs (`p_from` / `p_to` are dates). */
export function cairoDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const localPhone = (p: string) => p.replace(/^\+20/, "0");
