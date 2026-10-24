"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Order } from "./types";

const ACTIVE = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"];

/**
 * Active orders + the last 24 h of finished ones, kept live with Supabase Realtime
 * (RLS limits staff to their branch). `fresh` holds ids of orders that just arrived,
 * so the board can flash them; `onNew` fires for each brand-new order (e.g. to beep).
 */
export function useOrders(onNew?: (o: Order) => void) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [error, setError] = useState("");
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [active, finished] = await Promise.all([
      supabase.from("orders").select("*").in("status", ACTIVE).order("created_at"),
      supabase.from("orders").select("*").in("status", ["completed", "cancelled"]).gte("updated_at", since).order("updated_at", { ascending: false }).limit(40),
    ]);
    if (active.error || finished.error) {
      setError((active.error ?? finished.error)!.message);
      return;
    }
    setError("");
    setOrders([...(active.data as Order[]), ...(finished.data as Order[])]);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("admin-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const o = payload.new as Order;
          setFresh((f) => [...f, o.id]);
          window.setTimeout(() => setFresh((f) => f.filter((id) => id !== o.id)), 8000);
          onNewRef.current?.(o);
        }
        load();
      })
      .subscribe();
    // Safety net in case the socket drops (laptop sleep, flaky Wi-Fi)
    const id = window.setInterval(load, 60_000);
    return () => {
      window.clearInterval(id);
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { orders, fresh, error, reload: load };
}
