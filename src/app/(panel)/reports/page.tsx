"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, Card, ErrorNote, Input, PageHeader, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { cairoDate, cn, egp } from "@/lib/utils";

type Summary = { orders_placed: number; orders_completed: number; orders_cancelled: number; cancel_rate_pct: number; gross_sales: number; discounts: number; delivery_fees: number; net_revenue: number; avg_order_value: number; unique_customers: number };
type Daily = { business_day: string; orders_placed: number; orders_completed: number; orders_cancelled: number; pickup_orders: number; delivery_orders: number; net_revenue: number; avg_order_value: number };
type TopItem = { item_name: string; category_name: string; quantity_sold: number; revenue: number };
type Pay = { payment_method: string; orders_completed: number; net_revenue: number; share_pct: number };
type Cat = { category_name: string; quantity_sold: number; revenue: number; share_pct: number };
type Hour = { hour_of_day: number; orders_completed: number; net_revenue: number };

type Data = { summary: Summary; daily: Daily[]; top: TopItem[]; pay: Pay[]; cats: Cat[]; hours: Hour[] };

const daysAgo = (n: number) => cairoDate(new Date(Date.now() - n * 86400000));
const PRESETS = [
  { label: "Today", from: () => daysAgo(0), to: () => daysAgo(0) },
  { label: "Last 7 days", from: () => daysAgo(6), to: () => daysAgo(0) },
  { label: "Last 30 days", from: () => daysAgo(29), to: () => daysAgo(0) },
  { label: "This month", from: () => `${daysAgo(0).slice(0, 8)}01`, to: () => daysAgo(0) },
];

function sumSummaries(rows: Summary[]): Summary {
  const s = rows.reduce(
    (a, r) => ({
      orders_placed: a.orders_placed + Number(r.orders_placed),
      orders_completed: a.orders_completed + Number(r.orders_completed),
      orders_cancelled: a.orders_cancelled + Number(r.orders_cancelled),
      cancel_rate_pct: 0,
      gross_sales: a.gross_sales + Number(r.gross_sales),
      discounts: a.discounts + Number(r.discounts),
      delivery_fees: a.delivery_fees + Number(r.delivery_fees),
      net_revenue: a.net_revenue + Number(r.net_revenue),
      avg_order_value: 0,
      unique_customers: a.unique_customers + Number(r.unique_customers),
    }),
    { orders_placed: 0, orders_completed: 0, orders_cancelled: 0, cancel_rate_pct: 0, gross_sales: 0, discounts: 0, delivery_fees: 0, net_revenue: 0, avg_order_value: 0, unique_customers: 0 },
  );
  s.avg_order_value = s.orders_completed ? Math.round(s.net_revenue / s.orders_completed) : 0;
  s.cancel_rate_pct = s.orders_placed ? Math.round((s.orders_cancelled / s.orders_placed) * 1000) / 10 : 0;
  return s;
}

function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full bg-primary", className)} style={{ width: `${max ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

export default function ReportsPage() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(daysAgo(0));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const args = { p_from: from, p_to: to, p_branch_id: null };
    const [summary, daily, top, pay, cats, hours] = await Promise.all([
      supabase.rpc("report_branch_summary", args),
      supabase.rpc("report_daily_sales", args),
      supabase.rpc("report_top_items", { ...args, p_limit: 10 }),
      supabase.rpc("report_payment_methods", args),
      supabase.rpc("report_category_sales", args),
      supabase.rpc("report_hourly_sales", args),
    ]);
    setLoading(false);
    const err = [summary, daily, top, pay, cats, hours].find((r) => r.error)?.error;
    if (err) return setError(err.message);
    setData({
      summary: sumSummaries((summary.data ?? []) as Summary[]),
      daily: (daily.data ?? []) as Daily[],
      top: (top.data ?? []) as TopItem[],
      pay: (pay.data ?? []) as Pay[],
      cats: (cats.data ?? []) as Cat[],
      hours: (hours.data ?? []) as Hour[],
    });
  }, [from, to]);

  useEffect(() => {
    document.title = "Reports · Panzutti Admin";
    load();
  }, [load]);

  const maxDaily = useMemo(() => Math.max(0, ...(data?.daily ?? []).map((d) => Number(d.net_revenue))), [data]);
  const maxTop = useMemo(() => Math.max(0, ...(data?.top ?? []).map((d) => Number(d.quantity_sold))), [data]);
  const maxHour = useMemo(() => Math.max(0, ...(data?.hours ?? []).map((d) => Number(d.orders_completed))), [data]);

  const exportCsv = () => {
    if (!data) return;
    const head = ["day", "orders_placed", "orders_completed", "orders_cancelled", "pickup", "delivery", "net_revenue_egp", "avg_order_egp"];
    const lines = data.daily.map((d) => [d.business_day, d.orders_placed, d.orders_completed, d.orders_cancelled, d.pickup_orders, d.delivery_orders, Number(d.net_revenue) / 100, Number(d.avg_order_value) / 100].join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `panzutti-sales-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const s = data?.summary;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Revenue counts completed orders only. A business day runs 5:00 am – 4:59 am Cairo time."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!data?.daily.length}>
            <Download className="h-4 w-4" aria-hidden /> Export CSV
          </Button>
        }
      />

      <Card className="mb-6 flex flex-wrap items-end gap-3">
        {PRESETS.map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant={from === p.from() && to === p.to() ? "primary" : "outline"}
            onClick={() => {
              setFrom(p.from());
              setTo(p.to());
            }}
          >
            {p.label}
          </Button>
        ))}
        <label className="ms-auto text-sm font-bold">
          From
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-9 w-40" />
        </label>
        <label className="text-sm font-bold">
          To
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="mt-1 h-9 w-40" />
        </label>
      </Card>

      <ErrorNote message={error} />

      {!data || loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Net revenue", egp(s!.net_revenue)],
              ["Completed orders", s!.orders_completed],
              ["Average order", egp(s!.avg_order_value)],
              ["Cancelled", `${s!.orders_cancelled} (${s!.cancel_rate_pct}%)`],
              ["Customers", s!.unique_customers],
            ].map(([label, value]) => (
              <Card key={label as string}>
                <p className="text-sm font-bold text-muted-foreground">{label}</p>
                <p className="mt-1 font-display text-2xl text-primary">{value}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-xl text-primary">Sales by day</h2>
              {data.daily.length === 0 ? (
                <p className="text-sm text-muted-foreground">No orders in this period.</p>
              ) : (
                <ul className="space-y-2">
                  {data.daily.map((d) => (
                    <li key={d.business_day} className="grid grid-cols-[90px_1fr_110px] items-center gap-3 text-sm">
                      <span className="font-bold">{new Date(d.business_day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</span>
                      <Bar value={Number(d.net_revenue)} max={maxDaily} />
                      <span className="text-right tabular-nums">
                        {egp(Number(d.net_revenue))} <span className="text-muted-foreground">· {d.orders_completed}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-xl text-primary">Top items</h2>
              {data.top.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales yet.</p>
              ) : (
                <ol className="space-y-2">
                  {data.top.map((t, i) => (
                    <li key={t.item_name} className="grid grid-cols-[24px_1fr_70px_100px] items-center gap-3 text-sm">
                      <span className="font-bold text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="truncate font-bold">{t.item_name}</p>
                        <Bar value={Number(t.quantity_sold)} max={maxTop} className="bg-brand-red" />
                      </div>
                      <span className="text-right tabular-nums">{t.quantity_sold} sold</span>
                      <span className="text-right tabular-nums">{egp(Number(t.revenue))}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-xl text-primary">Payment methods</h2>
              {data.pay.length === 0 ? (
                <p className="text-sm text-muted-foreground">No completed orders yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.pay.map((p) => (
                    <li key={p.payment_method} className="text-sm">
                      <div className="mb-1 flex justify-between">
                        <span className="font-bold capitalize">{p.payment_method}</span>
                        <span className="tabular-nums">{egp(Number(p.net_revenue))} · {p.orders_completed} orders · {p.share_pct}%</span>
                      </div>
                      <Bar value={Number(p.share_pct)} max={100} className={p.payment_method === "instapay" ? "bg-brand-yellow" : "bg-primary"} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-xl text-primary">Categories</h2>
              {data.cats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.cats.map((c) => (
                    <li key={c.category_name} className="text-sm">
                      <div className="mb-1 flex justify-between">
                        <span className="font-bold">{c.category_name}</span>
                        <span className="tabular-nums">{egp(Number(c.revenue))} · {c.share_pct}%</span>
                      </div>
                      <Bar value={Number(c.share_pct)} max={100} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <h2 className="mb-4 text-xl text-primary">Busy hours (completed orders)</h2>
            {data.hours.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed orders yet.</p>
            ) : (
              <div className="flex h-40 items-end gap-1">
                {Array.from({ length: 24 }, (_, h) => {
                  const row = data.hours.find((x) => Number(x.hour_of_day) === h);
                  const v = Number(row?.orders_completed ?? 0);
                  return (
                    <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${h}:00 — ${v} orders`}>
                      <div className="w-full rounded-t bg-primary/80" style={{ height: `${maxHour ? (v / maxHour) * 120 : 0}px` }} />
                      <span className="text-[10px] text-muted-foreground">{h % 3 === 0 ? h : ""}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
