"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, CalendarDays, Contact, Phone, Search, ShoppingBag } from "lucide-react";
import { OrderDetail } from "@/components/order-detail";
import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { kindOf, type Order } from "@/lib/types";
import { dateTime, egp, localPhone } from "@/lib/utils";

/** Orders are read in pages of this size (PostgREST caps a single response at 1000 rows). */
const PAGE = 1000;
const MAX_ORDERS = 20_000;
const SHOW_STEP = 50;

/** One customer = every order placed with the same phone number (guests have no account). */
type Customer = { phone: string; name: string; email: string | null; orders: Order[]; spent: number; last: string };

function groupByPhone(orders: Order[]): Customer[] {
  const map = new Map<string, Customer>();
  // orders arrive newest first, so the first order seen gives the latest name/email
  for (const o of orders) {
    let c = map.get(o.customer_phone);
    if (!c) {
      c = { phone: o.customer_phone, name: o.customer_name, email: o.customer_email, orders: [], spent: 0, last: o.created_at };
      map.set(o.customer_phone, c);
    }
    c.email ??= o.customer_email;
    c.orders.push(o);
    if (o.status !== "cancelled") c.spent += o.total;
  }
  return [...map.values()];
}

function CustomerOrders({ c, onOpen }: { c: Customer; onOpen: (o: Order) => void }) {
  return (
    <ul className="mt-4 divide-y divide-border border-t border-border text-sm">
      {c.orders.map((o) => {
        const kind = kindOf(o);
        const TypeIcon = kind === "delivery" ? Bike : kind === "reservation" ? CalendarDays : ShoppingBag;
        return (
          <li key={o.id}>
            <button type="button" onClick={() => onOpen(o)} className="flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-start hover:bg-muted/50">
              <span className="flex items-center gap-2">
                <span className="font-display text-base text-primary">#{o.order_number}</span>
                <Badge tone={kind === "reservation" ? "dark" : "muted"}>
                  <TypeIcon className="h-3 w-3" aria-hidden /> {kind === "reservation" ? "table" : o.type}
                </Badge>
                <StatusBadge status={o.status} />
                {o.customer_name !== c.name && <span className="text-muted-foreground">as {o.customer_name}</span>}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{dateTime(o.created_at)}</span>
                <span className={o.status === "cancelled" ? "font-bold tabular-nums text-muted-foreground line-through" : "font-bold tabular-nums"}>{egp(o.total)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function CustomersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "orders" | "spent">("recent");
  const [open, setOpen] = useState<string | null>(null);
  const [shown, setShown] = useState(SHOW_STEP);
  const [detailId, setDetailId] = useState<string | null>(null);

  // RLS limits staff to their own branch; admins see every branch
  const load = useCallback(async () => {
    const all: Order[] = [];
    for (let from = 0; from < MAX_ORDERS; from += PAGE) {
      const { data, error: err } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (err) return setError(err.message);
      all.push(...(data as Order[]));
      if (data.length < PAGE) break;
    }
    setError("");
    setTruncated(all.length >= MAX_ORDERS);
    setOrders(all);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const customers = useMemo(() => (orders ? groupByPhone(orders) : null), [orders]);

  const rows = useMemo(() => {
    if (!customers) return null;
    const term = q.trim().toLowerCase();
    // phones are stored as +20…; match the typed digits without the leading 0
    const digits = term.replace(/\D/g, "").replace(/^0+/, "");
    const list = term
      ? customers.filter((c) =>
          digits.length >= 3
            ? c.phone.includes(digits) || c.orders.some((o) => String(o.order_number) === digits)
            : c.name.toLowerCase().includes(term) || c.orders.some((o) => o.customer_name.toLowerCase().includes(term)),
        )
      : [...customers];
    if (sort === "orders") list.sort((a, b) => b.orders.length - a.orders.length);
    else if (sort === "spent") list.sort((a, b) => b.spent - a.spent);
    return list;
  }, [customers, q, sort]);

  useEffect(() => setShown(SHOW_STEP), [q, sort]);

  const detail = detailId ? orders?.find((o) => o.id === detailId) : undefined;

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={customers ? `${customers.length} customers from ${orders!.length} orders. Grouped by phone number.` : "Everyone who has ordered, grouped by phone number."}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or order #" className="ps-9" aria-label="Search customers" />
        </label>
        <div className="flex gap-1" role="group" aria-label="Sort">
          {(
            [
              ["recent", "Latest order"],
              ["orders", "Most orders"],
              ["spent", "Most spent"],
            ] as const
          ).map(([key, label]) => (
            <Button key={key} size="sm" variant={sort === key ? "primary" : "outline"} onClick={() => setSort(key)}>
              {label}
            </Button>
          ))}
        </div>
      </div>

      <ErrorNote message={error} />
      {truncated && <p className="mb-3 text-sm text-muted-foreground">Showing customers from the latest {MAX_ORDERS.toLocaleString()} orders only.</p>}

      {!rows ? (
        error ? null : <Spinner />
      ) : !rows.length ? (
        <Empty title={q ? "No customer matches" : "No customers yet"} hint={q ? undefined : "Customers appear after their first order."} icon={<Contact className="h-8 w-8" />} />
      ) : (
        <div className="space-y-3">
          {rows.slice(0, shown).map((c) => (
            <Card key={c.phone}>
              <button type="button" onClick={() => setOpen(open === c.phone ? null : c.phone)} aria-expanded={open === c.phone} className="flex w-full flex-wrap items-center justify-between gap-3 text-start">
                <span className="min-w-0">
                  <span className="font-display text-lg text-primary">{c.name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 text-sm">
                    <span className="flex items-center gap-1 font-bold" dir="ltr">
                      <Phone className="h-3.5 w-3.5" aria-hidden /> {localPhone(c.phone)}
                    </span>
                    {c.email && <span className="truncate text-muted-foreground">{c.email}</span>}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone="green">
                    {c.orders.length} {c.orders.length === 1 ? "order" : "orders"}
                  </Badge>
                  <Badge tone="yellow">{egp(c.spent)}</Badge>
                  <span className="text-xs text-muted-foreground">last {dateTime(c.last)}</span>
                </span>
              </button>
              {open === c.phone && <CustomerOrders c={c} onOpen={(o) => setDetailId(o.id)} />}
            </Card>
          ))}
          {rows.length > shown && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setShown((n) => n + SHOW_STEP)}>
                Show more ({rows.length - shown} left)
              </Button>
            </div>
          )}
        </div>
      )}

      {detail && <OrderDetail order={detail} onClose={() => setDetailId(null)} onChanged={load} />}
    </>
  );
}
