"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { BellRing, Volume2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/types";

type PendingOrder = Pick<Order, "id" | "order_number" | "customer_name">;

const SOUND_KEY = "panzutti-order-alarm-v1";
const ACK_KEY = "panzutti-order-alarm-acked-v1";
/** Older pending orders don't ring, so a forgotten order can't set the alarm off every time the panel opens. */
const RING_WINDOW_MS = 2 * 3600 * 1000;
const POLL_MS = 10_000; // safety net in case the realtime socket drops

const AlarmContext = createContext<{
  enabled: boolean;
  toggle: () => void;
  /** Staff have seen these orders: stop ringing for them on this browser */
  acknowledge: (ids: string[]) => void;
  /** Check pending orders now, e.g. right after one was accepted */
  refresh: () => void;
} | null>(null);
export const useOrderAlarm = () => useContext(AlarmContext);

const readAcked = () => {
  try {
    return JSON.parse(window.localStorage.getItem(ACK_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
};

/** Four sharp two-tone beeps, then a short pause. Rendered up front and looped by the audio thread, so a background tab keeps ringing (timers get throttled there). */
function alarmSound(ctx: AudioContext) {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(rate * 1.7), rate);
  const data = buffer.getChannelData(0);
  [988, 784, 988, 784].forEach((freq, n) => {
    const from = Math.floor(n * 0.27 * rate);
    const length = Math.floor(0.22 * rate);
    for (let i = 0; i < length; i++) {
      const wave = Math.sin((2 * Math.PI * freq * i) / rate);
      const fade = Math.min(1, i / (0.005 * rate), (length - i) / (0.005 * rate)); // no clicks
      data[from + i] = (0.45 * wave + 0.45 * Math.sign(wave)) * fade; // the square part carries on small speakers
    }
  });
  return buffer;
}

/**
 * Rings on every panel page while a new order is waiting, until someone presses Stop or opens the order
 * here, or it is accepted on any device (it leaves "pending"). Browsers only allow sound after a click on the page,
 * so until then a prompt asks for one.
 */
export function OrderAlarmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [acked, setAcked] = useState<string[]>(readAcked);
  const [enabled, setEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(SOUND_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const [unlocked, setUnlocked] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const sound = useRef<AudioBuffer | null>(null);

  const play = useCallback((loop: boolean) => {
    const ctx = audio.current;
    if (!ctx) return null;
    sound.current ??= alarmSound(ctx);
    const source = ctx.createBufferSource();
    source.buffer = sound.current;
    source.loop = loop;
    source.connect(ctx.destination);
    source.start();
    return source;
  }, []);

  const lastLoad = useRef(0);
  const load = useCallback(async () => {
    const request = ++lastLoad.current;
    const since = new Date(Date.now() - RING_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, customer_name")
      .eq("status", "pending")
      .gte("created_at", since)
      .order("created_at");
    // an older answer arriving late must not bring back an order that was just accepted
    if (!error && request === lastLoad.current) setPending((data as PendingOrder[]) ?? []);
  }, []);

  // Pending orders, live
  useEffect(() => {
    load();
    // New topic per mount: channel() would hand back the previous one while it is still closing
    const channel = supabase
      .channel(`order-alarm-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      window.clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, [load]);

  // Audio, unlocked by the first click or key press (or right away if this page already had one, e.g. the login)
  useEffect(() => {
    const ctx = new AudioContext();
    audio.current = ctx;
    const sync = () => setUnlocked(ctx.state === "running");
    const unlock = () => void ctx.resume().catch(() => {}); // rejects if the page closes the context first
    ctx.addEventListener("statechange", sync);
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    unlock();
    sync();
    return () => {
      ctx.removeEventListener("statechange", sync);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      audio.current = null;
      sound.current = null;
      void ctx.close();
    };
  }, []);

  // A Stop in another tab also silences this one
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACK_KEY) setAcked(readAcked());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const waiting = pending.filter((o) => !acked.includes(o.id));
  const ringing = enabled && unlocked && waiting.length > 0;

  useEffect(() => {
    if (!ringing) return;
    const source = play(true);
    return () => source?.stop();
  }, [ringing, play]);

  const acknowledge = useCallback((ids: string[]) => {
    setAcked((cur) => (ids.every((id) => cur.includes(id)) ? cur : [...new Set([...cur, ...ids])].slice(-100)));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACK_KEY, JSON.stringify(acked));
    } catch {
      // storage blocked: silenced until the next reload
    }
  }, [acked]);

  const stop = () => acknowledge(waiting.map((o) => o.id));

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      // storage blocked: applies to this page view
    }
    if (next && !waiting.length) play(false); // lets staff check the volume
  };

  const first = waiting[0];

  return (
    <AlarmContext.Provider value={{ enabled, toggle, acknowledge, refresh: load }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-2 sm:start-auto">
        {enabled && !unlocked && (
          <button
            type="button"
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-brand-yellow px-4 py-2.5 text-sm font-extrabold text-foreground shadow-lg"
          >
            <Volume2 className="h-4 w-4" aria-hidden /> Click to turn on the new order alarm
          </button>
        )}
        {first && (
          <div role="alert" className="pointer-events-auto flex w-full max-w-sm flex-wrap items-center gap-3 rounded-2xl bg-brand-red p-4 text-brand-cream shadow-2xl ring-4 ring-brand-red/30">
            <BellRing className="h-7 w-7 shrink-0 animate-pulse" aria-hidden />
            <p className="min-w-0 flex-1">
              <span className="block font-display text-xl leading-tight">{waiting.length > 1 ? `${waiting.length} new orders` : `New order #${first.order_number}`}</span>
              {waiting.length === 1 && <span className="block truncate text-sm">{first.customer_name}</span>}
            </p>
            <div className="flex w-full gap-2">
              <button type="button" onClick={stop} className="flex-1 rounded-full bg-brand-cream px-4 py-2 font-extrabold text-brand-red">
                Stop alarm
              </button>
              <Link href="/orders" onClick={stop} className="flex-1 rounded-full px-4 py-2 text-center font-extrabold ring-2 ring-brand-cream">
                Open orders
              </Link>
            </div>
          </div>
        )}
      </div>
    </AlarmContext.Provider>
  );
}
