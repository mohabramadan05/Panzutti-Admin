"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Star } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { dateTime, egp, localPhone } from "@/lib/utils";

type Settings = { loyalty_enabled: boolean; loyalty_earn_amount: number; loyalty_redeem_points: number; loyalty_redeem_value: number };
type Account = { phone: string; customer_name: string | null; points: number; lifetime_points: number; updated_at: string };
type Tx = { id: string; delta: number; reason: string; note: string | null; created_at: string; orders: { order_number: number } | null };

const REASON: Record<string, string> = { earn: "Earned", redeem: "Spent", refund: "Refunded", reverse: "Taken back", adjust: "Manual" };

/** Admin-only rules: 1 point per X EGP spent (food after discounts) and how many points = how much money off. */
function LoyaltySettings() {
  const [s, setS] = useState<Settings | null>(null);
  const [egpValue, setEgpValue] = useState("");
  const [earnEgp, setEarnEgp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("loyalty_enabled, loyalty_earn_amount, loyalty_redeem_points, loyalty_redeem_value")
      .eq("id", true)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) return setError(err?.message ?? "Couldn't load the settings (has the v7 SQL been run?)");
        setS(data as Settings);
        setEgpValue(String((data as Settings).loyalty_redeem_value / 100));
        setEarnEgp(String((data as Settings).loyalty_earn_amount / 100));
      });
  }, []);

  const save = async () => {
    if (!s) return;
    const value = Math.round(Number(egpValue) * 100);
    if (!Number.isFinite(value) || value < 0) return setError("Enter how many EGP the points are worth");
    if (s.loyalty_redeem_points < 1) return setError("Points to exchange must be at least 1");
    const earn = Math.round(Number(earnEgp) * 100);
    if (!Number.isFinite(earn) || earn < 1) return setError("Enter how many EGP earn 1 point");
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("app_settings")
      .update({ ...s, loyalty_redeem_value: value, loyalty_earn_amount: earn })
      .eq("id", true);
    setBusy(false);
    if (err) return setError(err.message);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  if (!s) return error ? <ErrorNote message={error} /> : <Spinner />;
  const num = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Math.trunc(Number(e.target.value) || 0) });

  return (
    <Card className="space-y-4">
      <label className="flex items-center gap-3 font-bold">
        <input type="checkbox" checked={s.loyalty_enabled} onChange={(e) => setS({ ...s, loyalty_enabled: e.target.checked })} className="h-5 w-5 accent-primary" />
        Points are switched on
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-bold">
          1 point for every (EGP)
          <Input type="number" min={0.01} step="0.5" value={earnEgp} onChange={(e) => setEarnEgp(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm font-bold">
          Points to exchange
          <Input type="number" min={1} value={s.loyalty_redeem_points} onChange={num("loyalty_redeem_points")} className="mt-1" />
        </label>
        <label className="block text-sm font-bold">
          …are worth (EGP)
          <Input type="number" min={0} step="0.5" value={egpValue} onChange={(e) => setEgpValue(e.target.value)} className="mt-1" />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        A customer earns <b>1</b> point for every <b>{egp(Math.round((Number(earnEgp) || 0) * 100))}</b> of food in a completed order (after
        discounts, without VAT, service or delivery). Every <b>{s.loyalty_redeem_points}</b> points take{" "}
        <b>{egp(Math.round((Number(egpValue) || 0) * 100))}</b> off their next order.
      </p>
      <ErrorNote message={error} />
      <div className="flex items-center gap-3">
        <Button onClick={save} busy={busy}>Save</Button>
        {saved && <span className="text-sm font-bold text-primary">Saved</span>}
      </div>
    </Card>
  );
}

function AccountDetail({ a, onChanged }: { a: Account; onChanged: () => void }) {
  const { isAdmin } = useAuth();
  const [tx, setTx] = useState<Tx[] | null>(null);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("loyalty_transactions")
      .select("id, delta, reason, note, created_at, orders(order_number)")
      .eq("phone", a.phone)
      .order("created_at", { ascending: false })
      .limit(30);
    setTx((data as unknown as Tx[]) ?? []);
  }, [a.phone]);

  useEffect(() => {
    load();
  }, [load]);

  const adjust = async () => {
    const n = Math.trunc(Number(delta));
    if (!n) return setError("Enter points to add (e.g. 50) or remove (e.g. -50)");
    setBusy(true);
    setError("");
    const { error: err } = await supabase.rpc("admin_adjust_points", { p_phone: a.phone, p_delta: n, p_note: note.trim() || null });
    setBusy(false);
    if (err) return setError(err.message);
    setDelta("");
    setNote("");
    load();
    onChanged();
  };

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      {isAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-32 text-sm font-bold">
            Points (+/−)
            <Input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="50" className="mt-1" />
          </label>
          <label className="min-w-40 flex-1 text-sm font-bold">
            Reason (optional)
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="mt-1" />
          </label>
          <Button onClick={adjust} busy={busy}>Apply</Button>
        </div>
      )}
      <ErrorNote message={error} />
      {!tx ? (
        <Spinner />
      ) : !tx.length ? (
        <p className="text-sm text-muted-foreground">No history yet.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {tx.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <b>{REASON[t.reason] ?? t.reason}</b>
                {t.orders && <span className="text-muted-foreground"> · order #{t.orders.order_number}</span>}
                {t.note && <span className="text-muted-foreground"> · {t.note}</span>}
                <span className="block text-xs text-muted-foreground">{dateTime(t.created_at)}</span>
              </span>
              <span className={t.delta > 0 ? "font-bold text-primary tabular-nums" : "font-bold text-brand-red tabular-nums"}>
                {t.delta > 0 ? "+" : ""}
                {t.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LoyaltyPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Account[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    let query = supabase.from("loyalty_accounts").select("phone, customer_name, points, lifetime_points, updated_at").order("points", { ascending: false }).limit(50);
    const term = q.trim();
    if (term) {
      // phones are stored as +20…; match the typed digits without the leading 0
      const digits = term.replace(/\D/g, "").replace(/^0+/, "");
      query = digits.length >= 3 ? query.ilike("phone", `%${digits}%`) : query.ilike("customer_name", `%${term}%`);
    }
    const { data, error: err } = await query;
    if (err) return setError(err.message);
    setError("");
    setRows((data as Account[]) ?? []);
  }, [q]);

  useEffect(() => {
    const id = window.setTimeout(load, 300);
    return () => window.clearTimeout(id);
  }, [load]);

  return (
    <>
      <PageHeader title="Loyalty points" subtitle="Customers are matched by phone number. Points are added when an order is completed." />

      <section className="mb-8">
        <h2 className="mb-3 text-xl text-primary">Rules</h2>
        <AdminOnly>
          <LoyaltySettings />
        </AdminOnly>
      </section>

      <section>
        <h2 className="mb-3 text-xl text-primary">Customers</h2>
        <label className="relative mb-4 block max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search phone or name" className="ps-9" aria-label="Search customers" />
        </label>
        <ErrorNote message={error} />
        {!rows ? (
          <Spinner />
        ) : !rows.length ? (
          <Empty title="No customers with points yet" hint="Accounts appear after a customer's first completed order." icon={<Star className="h-8 w-8" />} />
        ) : (
          <div className="space-y-3">
            {rows.map((a) => (
              <Card key={a.phone}>
                <button type="button" onClick={() => setOpen(open === a.phone ? null : a.phone)} className="flex w-full flex-wrap items-center justify-between gap-3 text-start">
                  <span>
                    <span className="font-display text-lg text-primary">{a.customer_name ?? "—"}</span>
                    <span className="block text-sm font-bold" dir="ltr">{localPhone(a.phone)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone="yellow">
                      <Star className="h-3.5 w-3.5" aria-hidden /> {a.points} points
                    </Badge>
                    <span className="text-xs text-muted-foreground">{a.lifetime_points} earned in total</span>
                  </span>
                </button>
                {open === a.phone && <AccountDetail a={a} onChanged={load} />}
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
