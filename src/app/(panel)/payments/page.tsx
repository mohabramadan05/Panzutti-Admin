"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { ProofReview } from "@/components/proof-review";
import { Card, Empty, ErrorNote, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { OrderStatus, PaymentProof } from "@/lib/types";
import { cn, egp, localPhone } from "@/lib/utils";

type Row = PaymentProof & { orders: { order_number: number; customer_name: string; customer_phone: string; total: number; status: OrderStatus } | null };

export default function PaymentsPage() {
  const [tab, setTab] = useState<"pending" | "reviewed">("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    let q = supabase
      .from("payment_proofs")
      .select("*, orders(order_number, customer_name, customer_phone, total, status)")
      .order("created_at", { ascending: tab === "pending" })
      .limit(50);
    q = tab === "pending" ? q.eq("status", "pending") : q.neq("status", "pending");
    const { data, error: err } = await q;
    if (err) return setError(err.message);
    setError("");
    setRows((data ?? []) as Row[]);
  }, [tab]);

  useEffect(() => {
    document.title = "InstaPay · Panzutti Admin";
    setRows(null);
    load();
    const channel = supabase
      .channel("admin-proofs")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_proofs" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return (
    <>
      <PageHeader title="InstaPay payments" subtitle="Check each transfer screenshot against the amount, then approve or reject it." />
      <div role="tablist" className="mb-5 flex gap-2">
        {(["pending", "reviewed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("rounded-full px-4 py-2 text-sm font-bold capitalize", tab === t ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border")}
          >
            {t === "pending" ? "To check" : "Reviewed"}
          </button>
        ))}
      </div>
      <ErrorNote message={error} />
      {!rows ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty title={tab === "pending" ? "No screenshots waiting" : "Nothing reviewed yet"} hint="New uploads appear here automatically." icon={<CreditCard className="h-8 w-8" />} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.id}>
              {r.orders && (
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="font-display text-xl text-primary">#{r.orders.order_number}</span>
                  <StatusBadge status={r.orders.status} />
                  <span className="font-bold">{r.orders.customer_name}</span>
                  <span className="text-sm text-muted-foreground" dir="ltr">{localPhone(r.orders.customer_phone)}</span>
                  <span className="ms-auto font-display text-lg">{egp(r.orders.total)}</span>
                </div>
              )}
              <ProofReview proof={r} amount={r.orders ? egp(r.orders.total) : undefined} onDone={load} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
