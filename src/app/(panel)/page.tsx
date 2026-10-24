"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Camera, ClipboardList, CreditCard, Users } from "lucide-react";
import { Card, PageHeader, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { STATUS_LABEL, type OrderStatus } from "@/lib/types";
import { cairoDate, cn, egp } from "@/lib/utils";

type Today = { orders_placed: number; orders_completed: number; orders_cancelled: number; net_revenue: number; avg_order_value: number } | null;

const LIVE: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"];

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const [today, setToday] = useState<Today | undefined>(undefined);
  const [live, setLive] = useState<Record<string, number>>({});
  const [waiting, setWaiting] = useState({ proofs: 0, photos: 0, applications: 0 });

  useEffect(() => {
    document.title = "Dashboard · Panzutti Admin";
    const day = cairoDate();
    const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

    supabase.rpc("report_daily_sales", { p_from: day, p_to: day, p_branch_id: null }).then(({ data }) => setToday(((data as Today[]) ?? [])[0] ?? null));
    supabase
      .from("orders")
      .select("status")
      .in("status", LIVE)
      .then(({ data }) => {
        const c: Record<string, number> = {};
        (data ?? []).forEach((o: { status: string }) => (c[o.status] = (c[o.status] ?? 0) + 1));
        setLive(c);
      });
    Promise.all([
      count(supabase.from("payment_proofs").select("id", { count: "exact", head: true }).eq("status", "pending")),
      isAdmin ? count(supabase.from("family_photos").select("id", { count: "exact", head: true }).eq("status", "pending")) : Promise.resolve(0),
      isAdmin ? count(supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "new")) : Promise.resolve(0),
    ]).then(([proofs, photos, applications]) => setWaiting({ proofs, photos, applications }));
  }, [isAdmin]);

  const tasks = [
    { href: "/payments", label: "InstaPay screenshots to check", n: waiting.proofs, Icon: CreditCard, show: true },
    { href: "/family", label: "Family photos to approve", n: waiting.photos, Icon: Camera, show: isAdmin },
    { href: "/applications", label: "New job / supplier applications", n: waiting.applications, Icon: Users, show: isAdmin },
  ].filter((t) => t.show);

  return (
    <>
      <PageHeader title={`Ciao${profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}!`} subtitle="Here's how today is going." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Orders today", value: today?.orders_placed ?? 0 },
          { label: "Completed", value: today?.orders_completed ?? 0 },
          { label: "Revenue (completed)", value: egp(today?.net_revenue ?? 0) },
          { label: "Average order", value: egp(today?.avg_order_value ?? 0) },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-sm font-bold text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-display text-3xl text-primary">{today === undefined ? <Spinner className="h-5 w-5" /> : s.value}</p>
          </Card>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Business day runs 5:00 am – 4:59 am (Cairo). Revenue counts completed orders only.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl text-primary">Live orders</h2>
            <Link href="/orders" className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
              Open board <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {LIVE.map((s) => (
              <Link key={s} href="/orders" className={cn("rounded-xl p-3 text-center ring-1 ring-border hover:ring-primary", s === "pending" && live[s] ? "bg-brand-red text-brand-cream" : "bg-background")}>
                <p className="font-display text-3xl">{live[s] ?? 0}</p>
                <p className="text-xs font-bold uppercase tracking-wide opacity-80">{STATUS_LABEL[s]}</p>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-xl text-primary">Waiting for you</h2>
          <ul className="space-y-2">
            {tasks.map(({ href, label, n, Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-border hover:ring-primary">
                  <Icon className="h-5 w-5 text-primary" aria-hidden />
                  <span className="flex-1 font-bold">{label}</span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-extrabold", n ? "bg-brand-red text-brand-cream" : "bg-muted text-muted-foreground")}>{n}</span>
                </Link>
              </li>
            ))}
            <li>
              <Link href="/orders" className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-border hover:ring-primary">
                <ClipboardList className="h-5 w-5 text-primary" aria-hidden />
                <span className="flex-1 font-bold">New orders to confirm</span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-extrabold", live.pending ? "bg-brand-red text-brand-cream" : "bg-muted text-muted-foreground")}>{live.pending ?? 0}</span>
              </Link>
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
