"use client";

import { useState } from "react";
import { Bike, CheckCircle2, MapPin, Navigation, Phone, Wallet } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/types";
import { useOrders } from "@/lib/use-orders";
import { ago, egp, localPhone, time } from "@/lib/utils";

/** The checkout map pin travels in delivery_notes as a Google Maps link; otherwise search the typed address. */
function mapsUrl(o: Order) {
  const pin = o.delivery_notes?.match(/https:\/\/www\.google\.com\/maps\?q=[-0-9.,]+/)?.[0];
  return pin ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.delivery_address ?? "")}`;
}

function DeliveryCard({ o, mine, onDone }: { o: Order; mine: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notes = o.delivery_notes?.replace(/📍?\s*https:\/\/www\.google\.com\/maps\?q=[-0-9.,]+/, "").trim();
  const cash = o.payment_method === "cash" && o.payment_status !== "paid";

  const act = async (fn: "driver_take_order" | "driver_complete_order") => {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.rpc(fn, { p_order_id: o.id });
    setBusy(false);
    if (err) return setError(err.message);
    onDone();
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl text-primary">#{o.order_number}</p>
          <p className="text-xs text-muted-foreground">Ordered {time(o.created_at)} · {ago(o.updated_at)}</p>
        </div>
        {cash ? (
          <Badge tone="red" className="text-sm">
            <Wallet className="h-4 w-4" aria-hidden /> Collect {egp(o.total)}
          </Badge>
        ) : (
          <Badge tone="green" className="text-sm">Paid · {egp(o.total)}</Badge>
        )}
      </div>

      <div>
        <p className="font-bold">{o.customer_name}</p>
        <p className="mt-1 flex items-start gap-1.5 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" aria-hidden /> {o.delivery_address}
        </p>
        {notes && <p className="mt-1 whitespace-pre-line rounded-xl bg-muted px-3 py-2 text-sm">{notes}</p>}
        {o.note && <p className="mt-1 text-xs text-muted-foreground">Kitchen note: {o.note}</p>}
      </div>

      {mine && (
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:${o.customer_phone}`} className="inline-flex items-center justify-center gap-1.5 rounded-full bg-card px-4 py-2.5 font-bold text-primary ring-1 ring-border hover:ring-primary">
            <Phone className="h-4 w-4" aria-hidden /> <span dir="ltr">{localPhone(o.customer_phone)}</span>
          </a>
          <a href={mapsUrl(o)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-card px-4 py-2.5 font-bold text-primary ring-1 ring-border hover:ring-primary">
            <Navigation className="h-4 w-4" aria-hidden /> Directions
          </a>
        </div>
      )}

      <ErrorNote message={error} />
      {mine ? (
        <Button busy={busy} className="w-full py-3.5 text-lg" onClick={() => act("driver_complete_order")}>
          <CheckCircle2 className="h-5 w-5" aria-hidden /> Delivered{cash ? ` — collected ${egp(o.total)}` : ""}
        </Button>
      ) : (
        <Button variant="danger" busy={busy} className="w-full py-3.5 text-lg" onClick={() => act("driver_take_order")}>
          <Bike className="h-5 w-5" aria-hidden /> Take this order
        </Button>
      )}
    </Card>
  );
}

/** Drivers only: ready delivery orders to take, and the ones they are delivering (RLS shows nothing else). */
export default function DeliveriesPage() {
  const { profile } = useAuth();
  const { orders, error, reload } = useOrders();
  const me = profile?.id;

  if (!orders) return error ? <ErrorNote message={error} /> : <Spinner />;
  const mine = orders.filter((o) => o.driver_id === me && o.status === "out_for_delivery");
  const ready = orders.filter((o) => o.status === "ready" && !o.driver_id);
  const doneToday = orders.filter((o) => o.driver_id === me && o.status === "completed");
  const collected = doneToday.filter((o) => o.payment_method === "cash").reduce((s, o) => s + o.total, 0);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Deliveries" subtitle={`Hi ${profile?.full_name || "there"} — take a ready order, then mark it delivered.`} />
      <ErrorNote message={error} />

      <section className="mb-8">
        <h2 className="mb-3 text-xl text-primary">On the way ({mine.length})</h2>
        {mine.length ? (
          <div className="space-y-4">
            {mine.map((o) => <DeliveryCard key={o.id} o={o} mine onDone={reload} />)}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing with you right now.</p>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl text-primary">Ready to pick up ({ready.length})</h2>
        {ready.length ? (
          <div className="space-y-4">
            {ready.map((o) => <DeliveryCard key={o.id} o={o} mine={false} onDone={reload} />)}
          </div>
        ) : (
          <Empty title="No orders waiting" hint="New ones appear here as soon as the kitchen marks them ready." icon={<Bike className="h-8 w-8" />} />
        )}
      </section>

      <Card className="flex items-center justify-between">
        <span className="font-bold">Delivered in the last 24 h: {doneToday.length}</span>
        <span className="text-sm text-muted-foreground">Cash: <b className="text-foreground">{egp(collected)}</b></span>
      </Card>
    </div>
  );
}
