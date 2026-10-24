"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Bike, CalendarClock, CalendarDays, CheckCircle2, MapPin, MessageSquare, Phone, ShoppingBag, Users, Wallet, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NEXT_LABEL, STATUS_LABEL, kindOf, nextStatus, type Order, type OrderItem, type PaymentProof } from "@/lib/types";
import { dateTime, egp, localPhone, time } from "@/lib/utils";
import { ProofReview } from "./proof-review";
import { Badge, Button, ErrorNote, Input, Spinner, StatusBadge } from "./ui";

type History = { id: string; to_status: string; note: string | null; created_at: string };

/** Slide-over with everything about one order and the actions staff can take on it. */
export function OrderDetail({ order, onClose, onChanged }: { order: Order; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const [it, hi, pr] = await Promise.all([
      supabase.from("order_items").select("id, item_name, quantity, unit_price, line_total, note, order_item_addons(id, group_name, addon_name, quantity)").eq("order_id", order.id),
      supabase.from("order_status_history").select("id, to_status, note, created_at").eq("order_id", order.id).order("created_at"),
      supabase.from("payment_proofs").select("*").eq("order_id", order.id).order("created_at", { ascending: false }),
    ]);
    setItems((it.data ?? []) as OrderItem[]);
    setHistory((hi.data ?? []) as History[]);
    setProofs((pr.data ?? []) as PaymentProof[]);
  }, [order.id]);

  useEffect(() => {
    setItems(null);
    setCancelling(false);
    setReason("");
    setError("");
    load();
  }, [load, order.updated_at]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const run = async (key: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(key);
    setError("");
    const { error: err } = await fn();
    setBusy(null);
    if (err) return setError(err.message);
    setCancelling(false);
    onChanged();
    load();
  };

  const next = nextStatus(order);
  const done = order.status === "completed" || order.status === "cancelled";
  const unpaidInstapay = order.payment_method === "instapay" && order.payment_status !== "paid";
  const kind = kindOf(order);
  const TypeIcon = kind === "delivery" ? Bike : kind === "reservation" ? CalendarDays : ShoppingBag;
  const pct = (r: number | undefined) => `${Math.round(Number(r ?? 0) * 100)}%`;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-foreground/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`Order ${order.order_number}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-background shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl text-primary">#{order.order_number}</h2>
              <StatusBadge status={order.status} />
              <Badge tone={kind === "reservation" ? "dark" : "muted"}>
                <TypeIcon className="h-3.5 w-3.5" aria-hidden /> {kind === "reservation" ? "table reservation" : order.type}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Placed {dateTime(order.created_at)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 p-5">
          {/* actions */}
          {!done && (
            <section className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-wrap gap-2">
                {next && (
                  <Button
                    busy={busy === "next"}
                    disabled={next === "completed" && unpaidInstapay}
                    onClick={() => run("next", () => supabase.rpc("update_order_status", { p_order_id: order.id, p_status: next, p_reason: null }))}
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> {NEXT_LABEL[next]}
                  </Button>
                )}
                {unpaidInstapay && (
                  <Button variant="yellow" busy={busy === "paid"} onClick={() => run("paid", () => supabase.rpc("mark_order_paid", { p_order_id: order.id }))}>
                    <Wallet className="h-4 w-4" aria-hidden /> Mark paid
                  </Button>
                )}
                {!cancelling && (
                  <Button variant="outline" onClick={() => setCancelling(true)}>
                    <Ban className="h-4 w-4" aria-hidden /> Cancel order…
                  </Button>
                )}
              </div>
              {next === "completed" && unpaidInstapay && (
                <p className="text-sm font-bold text-brand-red">InstaPay isn&apos;t paid yet — approve the screenshot or mark it paid before completing.</p>
              )}
              {cancelling && (
                <div className="space-y-2">
                  <Input autoFocus placeholder="Reason (required, e.g. customer asked / out of stock)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      busy={busy === "cancel"}
                      disabled={!reason.trim()}
                      onClick={() => run("cancel", () => supabase.rpc("update_order_status", { p_order_id: order.id, p_status: "cancelled", p_reason: reason.trim() }))}
                    >
                      Cancel order
                    </Button>
                    <Button variant="ghost" onClick={() => setCancelling(false)}>Keep it</Button>
                  </div>
                </div>
              )}
              <ErrorNote message={error} />
            </section>
          )}
          {order.status === "cancelled" && order.cancel_reason && (
            <p className="rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background">Cancelled: {order.cancel_reason}</p>
          )}

          {/* customer */}
          <section className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
            <p className="font-display text-lg text-primary">{order.customer_name}</p>
            <a href={`tel:${order.customer_phone}`} className="flex items-center gap-2 font-bold text-primary hover:underline">
              <Phone className="h-4 w-4" aria-hidden /> <span dir="ltr">{localPhone(order.customer_phone)}</span>
            </a>
            {order.customer_email && <p className="text-sm text-muted-foreground">{order.customer_email}</p>}
            {order.type === "delivery" && order.delivery_address && (
              <p className="flex gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-red" aria-hidden />
                <span>
                  {order.delivery_address}
                  {order.delivery_notes && <span className="block text-muted-foreground">{order.delivery_notes}</span>}
                </span>
              </p>
            )}
            {kind === "reservation" ? (
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-brand-yellow/50 px-3 py-2 text-sm font-extrabold">
                <span className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" aria-hidden /> Table at {order.scheduled_for ? dateTime(order.scheduled_for) : "—"}
                </span>
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" aria-hidden /> {order.party_size ?? "?"} guests
                </span>
                <span className="w-full text-xs font-bold text-muted-foreground">Have the food ready for this time.</span>
              </p>
            ) : (
              order.scheduled_for && (
                <p className="flex items-center gap-2 text-sm font-bold text-brand-red">
                  <CalendarClock className="h-4 w-4" aria-hidden /> Scheduled for {dateTime(order.scheduled_for)}
                </p>
              )
            )}
            {order.note && (
              <p className="flex gap-2 rounded-xl bg-brand-yellow/40 p-3 text-sm">
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {order.note}
              </p>
            )}
          </section>

          {/* items */}
          <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
            <h3 className="mb-3 text-lg text-primary">Items</h3>
            {!items ? (
              <Spinner />
            ) : (
              <ul className="space-y-3">
                {items.map((it) => (
                  <li key={it.id} className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold">
                        <span className="me-1 rounded-md bg-primary px-1.5 text-primary-foreground">{it.quantity}×</span> {it.item_name}
                      </p>
                      {it.order_item_addons.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {it.order_item_addons.map((a) => `${a.quantity > 1 ? `${a.quantity}× ` : ""}${a.addon_name}`).join(" · ")}
                        </p>
                      )}
                      {it.note && <p className="text-sm font-bold text-brand-red">“{it.note}”</p>}
                    </div>
                    <span className="shrink-0 tabular-nums">{egp(it.line_total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-4 space-y-1 border-t border-dashed border-border pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd>{egp(order.subtotal)}</dd></div>
              {order.discount_total > 0 && (
                <div className="flex justify-between text-primary"><dt>Discount {order.promo_code && `(${order.promo_code})`}</dt><dd>−{egp(order.discount_total)}</dd></div>
              )}
              {order.delivery_fee > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Delivery</dt><dd>{egp(order.delivery_fee)}</dd></div>}
              {(order.service_total ?? 0) > 0 && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Service ({pct(order.service_rate)})</dt><dd>{egp(order.service_total)}</dd></div>
              )}
              {(order.tax_total ?? 0) > 0 && (
                <div className="flex justify-between"><dt className="text-muted-foreground">VAT ({pct(order.tax_rate)})</dt><dd>{egp(order.tax_total)}</dd></div>
              )}
              <div className="flex justify-between text-lg font-extrabold text-primary"><dt>Total</dt><dd>{egp(order.total)}</dd></div>
              <div className="flex justify-between pt-1">
                <dt className="text-muted-foreground">Payment</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-bold capitalize">{order.payment_method}</span>
                  <Badge tone={order.payment_status === "paid" ? "green" : "red"}>{order.payment_status}</Badge>
                </dd>
              </div>
            </dl>
          </section>

          {/* InstaPay screenshots */}
          {order.payment_method === "instapay" && (
            <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <h3 className="mb-3 text-lg text-primary">InstaPay screenshot</h3>
              {proofs.length === 0 ? (
                <p className="text-sm text-muted-foreground">The customer hasn&apos;t uploaded a screenshot yet.</p>
              ) : (
                <div className="space-y-5">
                  {proofs.map((p) => (
                    <ProofReview key={p.id} proof={p} amount={egp(order.total)} onDone={() => { onChanged(); load(); }} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* history */}
          {history.length > 0 && (
            <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <h3 className="mb-3 text-lg text-primary">History</h3>
              <ol className="space-y-1 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-3">
                    <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{time(h.created_at)}</span>
                    <span>
                      {STATUS_LABEL[h.to_status as keyof typeof STATUS_LABEL] ?? h.to_status}
                      {h.note && <span className="text-muted-foreground"> — {h.note}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}
