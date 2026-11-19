"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Power, Tag, Trash2 } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { Check, ConfirmDelete, Field, Modal } from "@/components/modal";
import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { dateTime, egp } from "@/lib/utils";

type Promo = {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number; // percent (20) or piasters (5000); 0 = free delivery only
  /** v9 (database/panzutti_supabase_v9.sql in the website repo): delivery fee becomes 0. Missing before v9 is run. */
  free_delivery?: boolean;
  max_discount: number | null;
  min_order_total: number;
  order_type: "pickup" | "delivery" | null;
  branch_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  per_user_limit: number | null;
  is_active: boolean;
};
type Branch = { id: string; name_en: string };

const TZ = "Africa/Cairo";
const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

/** ISO time → the Cairo wall-clock text a datetime-local input expects, the same zone the rest of the panel shows. */
const toCairoInput = (iso: string | number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(" ", "T");

/** Cairo wall-clock text from the input → ISO time, whatever time zone this computer is in. */
const fromCairoInput = (value: string) => {
  const asUtc = Date.parse(`${value}Z`);
  const offset = Date.parse(`${toCairoInput(asUtc)}Z`) - asUtc;
  return new Date(asUtc - offset).toISOString();
};

/** Whole number from a form box. Empty = null; anything else invalid = NaN. */
const toInt = (value: string) => {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
};

/** EGP text → piasters. Empty = null; anything else invalid = NaN. */
const toPiasters = (value: string) => {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

const discountLabel = (p: Promo) => {
  const off = !p.discount_value ? "" : p.discount_type === "percent" ? `${p.discount_value}% off${p.max_discount ? `, up to ${egp(p.max_discount)}` : ""}` : `${egp(p.discount_value)} off`;
  const text = [off, p.free_delivery && "free delivery"].filter(Boolean).join(" + ");
  return text ? text[0].toUpperCase() + text.slice(1) : "No discount";
};

function statusOf(p: Promo, used: number, now: number) {
  if (!p.is_active) return { label: "Off", tone: "muted" as const };
  if (p.ends_at && now >= Date.parse(p.ends_at)) return { label: "Expired", tone: "dark" as const };
  if (p.usage_limit !== null && used >= p.usage_limit) return { label: "Used up", tone: "dark" as const };
  if (p.starts_at && now < Date.parse(p.starts_at)) return { label: "Scheduled", tone: "yellow" as const };
  return { label: "Active", tone: "green" as const };
}

function PromoForm({ promo, branches, onClose, onSaved }: { promo: Promo | null; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    code: promo?.code ?? "",
    description: promo?.description ?? "",
    discount_type: promo?.discount_type ?? ("percent" as Promo["discount_type"]),
    free_delivery: !!promo?.free_delivery,
    value: promo?.discount_value === 0 ? "" : promo ? String(promo.discount_type === "percent" ? promo.discount_value : promo.discount_value / 100) : "",
    max_discount: promo?.max_discount ? String(promo.max_discount / 100) : "",
    min_order: promo ? String(promo.min_order_total / 100) : "0",
    order_type: promo?.order_type ?? "",
    branch_id: promo?.branch_id ?? "",
    starts_at: promo?.starts_at ? toCairoInput(promo.starts_at) : "",
    ends_at: promo?.ends_at ? toCairoInput(promo.ends_at) : "",
    usage_limit: promo?.usage_limit ? String(promo.usage_limit) : "",
    per_user_limit: promo?.per_user_limit ? String(promo.per_user_limit) : "",
    is_active: promo?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF((cur) => ({ ...cur, [key]: value }));
  const isPercent = f.discount_type === "percent";
  const isFree = f.free_delivery;

  const save = async () => {
    const code = f.code.trim().toUpperCase();
    // free delivery may come without money off: empty value = 0
    const value = isFree && f.value.trim() === "" ? 0 : isPercent ? toInt(f.value) : toPiasters(f.value);
    const freeOnly = isFree && value === 0;
    const max_discount = isPercent && f.value.trim() !== "" ? toPiasters(f.max_discount) : null;
    const min_order_total = toPiasters(f.min_order);
    const usage_limit = toInt(f.usage_limit);
    const per_user_limit = toInt(f.per_user_limit);

    if (!CODE_RE.test(code)) return setError("The code must be 3 to 30 letters or numbers, with no spaces (- and _ are fine)");
    if (!freeOnly && isPercent && (!value || value < 1 || value > 100)) return setError("Enter a whole percent from 1 to 100");
    if (!freeOnly && !isPercent && (!value || value < 1)) return setError("Enter the discount in EGP");
    if (max_discount !== null && !(max_discount > 0)) return setError("Enter the biggest discount in EGP, or leave it empty for no cap");
    if (min_order_total === null || !(min_order_total >= 0)) return setError("Enter the minimum order in EGP (0 = no minimum)");
    if (usage_limit !== null && !(usage_limit > 0)) return setError("Total uses must be a whole number above 0, or empty for unlimited");
    if (per_user_limit !== null && !(per_user_limit > 0)) return setError("Uses per customer must be a whole number above 0, or empty for unlimited");
    if (f.starts_at && f.ends_at && f.ends_at <= f.starts_at) return setError("The end time must be after the start time");

    setBusy(true);
    setError("");
    const row = {
      code,
      description: f.description.trim() || null,
      discount_type: f.discount_type,
      discount_value: value,
      max_discount,
      min_order_total,
      order_type: f.order_type || null,
      branch_id: f.branch_id || null,
      starts_at: f.starts_at ? fromCairoInput(f.starts_at) : null,
      ends_at: f.ends_at ? fromCairoInput(f.ends_at) : null,
      usage_limit,
      per_user_limit,
      is_active: f.is_active,
      // only sent when used, so other codes still save before v9 adds the column
      ...(isFree || promo?.free_delivery ? { free_delivery: isFree } : {}),
    };
    const query = promo ? supabase.from("promo_codes").update(row).eq("id", promo.id) : supabase.from("promo_codes").insert(row);
    const { data, error: err } = await query.select("id");
    setBusy(false);
    if (err) {
      if (err.code === "23505") return setError(`The code ${code} already exists`);
      // PGRST204 = unknown column: free_delivery is added by panzutti_supabase_v9.sql
      if (isFree && (err.code === "PGRST204" || err.code === "42703")) return setError("Free delivery codes need the v9 database update (panzutti_supabase_v9.sql) to be run first");
      return setError(err.message);
    }
    if (!data?.length) return setError("Not saved: only admins can change promo codes");
    onSaved();
  };

  const selectClass = "h-11 w-full rounded-xl bg-background px-3 ring-1 ring-border";

  return (
    <Modal title={promo ? `Edit ${promo.code}` : "New promo code"} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint="What customers type at checkout">
            <Input dir="ltr" value={f.code} onChange={(e) => set("code", e.target.value.toUpperCase())} maxLength={30} placeholder="SUMMER20" className="uppercase" />
          </Field>
          <Field label="Note (optional)" hint="Only staff see this">
            <Input value={f.description} onChange={(e) => set("description", e.target.value)} maxLength={200} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Discount type">
            <select value={f.discount_type} onChange={(e) => set("discount_type", e.target.value as Promo["discount_type"])} className={selectClass}>
              <option value="percent">Percent (%)</option>
              <option value="fixed">Fixed amount (EGP)</option>
            </select>
          </Field>
          <Field label={isPercent ? "Percent off" : "EGP off"} hint={isFree ? "Empty = free delivery only" : undefined}>
            <Input type="number" min={1} max={isPercent ? 100 : undefined} step={isPercent ? 1 : 0.5} value={f.value} onChange={(e) => set("value", e.target.value)} />
          </Field>
          {isPercent && (
            <Field label="Biggest discount (EGP)" hint="Empty = no cap">
              <Input type="number" min={0} step="1" value={f.max_discount} onChange={(e) => set("max_discount", e.target.value)} />
            </Field>
          )}
        </div>

        <div>
          <Check label="Free delivery" checked={f.free_delivery} onChange={(v) => set("free_delivery", v)} />
          <p className="mt-1 text-xs text-muted-foreground">
            The delivery fee becomes 0 on delivery orders. Leave the discount empty for a free-delivery-only code (it won&apos;t work on pickup).
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum order (EGP)" hint="Food total, before VAT and delivery">
            <Input type="number" min={0} step="1" value={f.min_order} onChange={(e) => set("min_order", e.target.value)} />
          </Field>
          <Field label="Valid for" hint="Table reservations count as pickup">
            <select value={f.order_type} onChange={(e) => set("order_type", e.target.value as typeof f.order_type)} className={selectClass}>
              <option value="">All orders</option>
              <option value="delivery">Delivery only</option>
              <option value="pickup">Pickup only</option>
            </select>
          </Field>
          {(branches.length > 1 || f.branch_id) && (
            <Field label="Branch">
              <select value={f.branch_id} onChange={(e) => set("branch_id", e.target.value)} className={selectClass}>
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name_en}</option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts (Cairo time)" hint="Empty = right away">
            <Input type="datetime-local" dir="ltr" value={f.starts_at} onChange={(e) => set("starts_at", e.target.value)} />
          </Field>
          <Field label="Ends (Cairo time)" hint="Empty = never">
            <Input type="datetime-local" dir="ltr" value={f.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
          </Field>
          <Field label="Total uses" hint="Empty = unlimited. Cancelled orders give the use back.">
            <Input type="number" min={1} step="1" value={f.usage_limit} onChange={(e) => set("usage_limit", e.target.value)} />
          </Field>
          <Field label="Uses per customer" hint="By phone number. Empty = unlimited">
            <Input type="number" min={1} step="1" value={f.per_user_limit} onChange={(e) => set("per_user_limit", e.target.value)} />
          </Field>
        </div>

        <Check label="Customers can use this code" checked={f.is_active} onChange={(v) => set("is_active", v)} />
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button busy={busy} onClick={save}>{promo ? "Save" : "Create code"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function Promos() {
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [used, setUsed] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Promo | "new" | null>(null);
  const [deleting, setDeleting] = useState<Promo | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [p, b] = await Promise.all([
      supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
      supabase.from("branches").select("id, name_en").order("created_at"),
    ]);
    if (p.error || b.error) return setError((p.error ?? b.error)!.message);
    const rows = (p.data as Promo[]) ?? [];
    // Same count as validate_promo_code: every order that used it, except cancelled ones
    const counts = await Promise.all(
      rows.map((r) => supabase.from("orders").select("id", { count: "exact", head: true }).eq("promo_code_id", r.id).neq("status", "cancelled")),
    );
    setError("");
    setNow(Date.now());
    setBranches((b.data as Branch[]) ?? []);
    setUsed(Object.fromEntries(rows.map((r, i) => [r.id, counts[i].count ?? 0])));
    setPromos(rows);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (p: Promo) => {
    setBusyId(p.id);
    const { error: err } = await supabase.from("promo_codes").update({ is_active: !p.is_active }).eq("id", p.id);
    setBusyId(null);
    if (err) return setError(err.message);
    load();
  };

  const remove = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    setDeleteError("");
    const { error: err } = await supabase.from("promo_codes").delete().eq("id", deleting.id);
    setBusyId(null);
    if (err) return setDeleteError(err.message);
    setDeleting(null);
    load();
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden /> New promo code
        </Button>
      </div>
      <ErrorNote message={error} />

      {!promos ? (
        !error && <Spinner />
      ) : !promos.length ? (
        <Empty title="No promo codes yet" hint="Create one and customers can use it at checkout right away." icon={<Tag className="h-8 w-8" />} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {promos.map((p) => {
            const uses = used[p.id] ?? 0;
            const status = statusOf(p, uses, now);
            const branch = branches.find((b) => b.id === p.branch_id);
            return (
              <Card key={p.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 dir="ltr" className="font-sans text-xl font-extrabold tracking-wide text-primary">{p.code}</h2>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <p className="font-bold">{discountLabel(p)}</p>
                {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>
                    {p.order_type === "delivery" ? "Delivery only" : p.order_type === "pickup" ? "Pickup and tables only" : "All orders"}
                    {p.min_order_total > 0 && ` · minimum ${egp(p.min_order_total)}`}
                    {branch && ` · ${branch.name_en}`}
                  </li>
                  {(p.starts_at || p.ends_at) && (
                    <li>
                      {p.starts_at && `From ${dateTime(p.starts_at)}`}
                      {p.starts_at && p.ends_at && " · "}
                      {p.ends_at && `Until ${dateTime(p.ends_at)}`}
                    </li>
                  )}
                  <li>
                    Used <b className="text-foreground">{uses}</b>
                    {p.usage_limit !== null ? ` of ${p.usage_limit} times` : uses === 1 ? " time" : " times"}
                    {p.per_user_limit !== null && ` · ${p.per_user_limit} per customer`}
                  </li>
                </ul>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                  </Button>
                  <Button size="sm" variant="outline" busy={busyId === p.id} onClick={() => toggle(p)}>
                    <Power className="h-3.5 w-3.5" aria-hidden /> {p.is_active ? "Turn off" : "Turn on"}
                  </Button>
                  {/* A used code stays, so reports keep it: turn it off instead */}
                  {uses === 0 && (
                    <Button size="sm" variant="ghost" onClick={() => { setDeleteError(""); setDeleting(p); }}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <PromoForm
          promo={editing === "new" ? null : editing}
          branches={branches}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title={`Delete ${deleting.code}?`}
          message="Customers will no longer be able to use this code. This can't be undone."
          busy={busyId === deleting.id}
          error={deleteError}
          onConfirm={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

export default function PromoCodesPage() {
  return (
    <>
      <PageHeader title="Promo codes" subtitle="Changes apply at checkout right away. Orders already placed keep their discount." />
      <AdminOnly>
        <Promos />
      </AdminOnly>
    </>
  );
}
