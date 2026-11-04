"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Bike, CalendarClock, CalendarDays, ClipboardList, ShoppingBag, Users } from "lucide-react";
import { useOrderAlarm } from "@/components/order-alarm";
import { OrderDetail } from "@/components/order-detail";
import { Badge, Button, Empty, ErrorNote, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { useOrders } from "@/lib/use-orders";
import { STATUS_LABEL, kindOf, type Order, type OrderStatus } from "@/lib/types";
import { ago, cairoDate, cn, dateTime, egp, time } from "@/lib/utils";

const COLUMNS: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"];

function OrderCard({ o, flash, onOpen, now }: { o: Order; flash: boolean; onOpen: () => void; now: number }) {
  const waitingPayment = o.payment_method === "instapay" && o.payment_status !== "paid";
  const kind = kindOf(o);
  const TypeIcon = kind === "delivery" ? Bike : kind === "reservation" ? CalendarDays : ShoppingBag;
  // Reservations can be days ahead: show the date unless it's today
  const when = o.scheduled_for && (cairoDate(new Date(o.scheduled_for)) === cairoDate() ? time(o.scheduled_for) : dateTime(o.scheduled_for));
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full rounded-xl bg-card p-3 text-start shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-primary",
        flash && "animate-flash ring-2 ring-brand-red",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-lg text-primary">#{o.order_number}</span>
        <span className="text-xs text-muted-foreground">{ago(o.created_at, now)}</span>
      </div>
      <p className="mt-1 truncate font-bold">{o.customer_name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={kind === "reservation" ? "dark" : "muted"}>
          <TypeIcon className="h-3 w-3" aria-hidden /> {kind === "reservation" ? "table" : o.type}
        </Badge>
        {kind === "reservation" && o.party_size != null && (
          <Badge tone="muted">
            <Users className="h-3 w-3" aria-hidden /> {o.party_size}
          </Badge>
        )}
        {waitingPayment && <Badge tone="red">InstaPay unpaid</Badge>}
        {o.payment_method === "instapay" && !waitingPayment && <Badge tone="green">InstaPay paid</Badge>}
        {when && (
          <Badge tone="yellow">
            <CalendarClock className="h-3 w-3" aria-hidden /> {when}
          </Badge>
        )}
        <span className="ms-auto text-sm font-extrabold tabular-nums">{egp(o.total)}</span>
      </div>
    </button>
  );
}

export default function OrdersPage() {
  const alarm = useOrderAlarm();
  const { orders, fresh, error, reload } = useOrders();
  const [openId, setOpenId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | "delivery" | "pickup" | "reservation">("all");
  const [now, setNow] = useState(() => Date.now());

  // keep "x min ago" fresh
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const shown = useMemo(() => (orders ?? []).filter((o) => typeFilter === "all" || kindOf(o) === typeFilter), [orders, typeFilter]);
  const pendingCount = shown.filter((o) => o.status === "pending").length;

  // New orders in the browser tab title, so a background tab still shows them
  useEffect(() => {
    document.title = pendingCount ? `(${pendingCount}) New orders · Panzutti Admin` : "Orders · Panzutti Admin";
  }, [pendingCount]);

  const open = orders?.find((o) => o.id === openId) ?? null;
  const finished = shown.filter((o) => o.status === "completed" || o.status === "cancelled");

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Live — new orders appear here automatically."
        actions={
          <>
            <div role="radiogroup" className="flex rounded-full bg-muted p-1 text-sm font-bold">
              {(["all", "delivery", "pickup", "reservation"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={typeFilter === v}
                  onClick={() => setTypeFilter(v)}
                  className={cn("rounded-full px-3 py-1.5 capitalize", typeFilter === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                >
                  {v === "reservation" ? "tables" : v}
                </button>
              ))}
            </div>
            {alarm && (
              <Button variant={alarm.enabled ? "yellow" : "outline"} onClick={alarm.toggle} aria-pressed={alarm.enabled}>
                {alarm.enabled ? <Bell className="h-4 w-4" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
                {alarm.enabled ? "Alarm on" : "Alarm off"}
              </Button>
            )}
          </>
        }
      />

      <ErrorNote message={error} />

      {!orders ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-5">
            {COLUMNS.filter((c) => c !== "out_for_delivery" || (typeFilter !== "pickup" && typeFilter !== "reservation")).map((col) => {
              const list = shown.filter((o) => o.status === col);
              return (
                <section key={col} className="min-w-0 rounded-2xl bg-muted/60 p-3">
                  <h2 className="mb-3 flex items-center justify-between font-sans text-sm font-extrabold uppercase tracking-wider text-muted-foreground">
                    {STATUS_LABEL[col]}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", col === "pending" && list.length ? "bg-brand-red text-brand-cream" : "bg-card")}>{list.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {list.map((o) => (
                      <OrderCard key={o.id} o={o} flash={fresh.includes(o.id)} onOpen={() => setOpenId(o.id)} now={now} />
                    ))}
                    {list.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">—</p>}
                  </div>
                </section>
              );
            })}
          </div>

          <section className="mt-8">
            <h2 className="mb-3 text-xl text-primary">Finished in the last 24 hours</h2>
            {finished.length === 0 ? (
              <Empty title="Nothing finished yet today" icon={<ClipboardList className="h-8 w-8" />} />
            ) : (
              <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-border">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-3">Order</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finished.map((o) => (
                      <tr key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer border-t border-border hover:bg-muted/50">
                        <td className="p-3 font-bold text-primary">#{o.order_number} <span className="font-normal text-muted-foreground">{time(o.created_at)}</span></td>
                        <td className="p-3">{o.customer_name}</td>
                        <td className="p-3 capitalize">{kindOf(o) === "reservation" ? `table · ${o.party_size ?? "?"}` : o.type}</td>
                        <td className="p-3"><StatusBadge status={o.status} /></td>
                        <td className="p-3 text-right font-bold tabular-nums">{egp(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {open && <OrderDetail order={open} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
