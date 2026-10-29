"use client";

import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { KeyRound, Search, UserPlus } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { Badge, Button, Card, ErrorNote, Input, PageHeader, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

type PanelRole = Exclude<Role, "customer">;
type Person = { id: string; full_name: string; email: string | null; role: Role; branch_id: string | null; is_active: boolean };
type Branch = { id: string; name_en: string };

const ROLES: PanelRole[] = ["admin", "staff", "cashier", "driver"];
const ROLE_HINT: Record<PanelRole, string> = {
  admin: "Everything, every branch, users and settings",
  staff: "Orders, InstaPay, sold-out, points and reports",
  cashier: "Orders, InstaPay, sold-out and points — no reports",
  driver: "Only delivery orders: take them and mark them delivered",
};
const select = "h-11 rounded-xl bg-background px-3 ring-1 ring-border outline-none focus:ring-2 focus:ring-primary";

/** admin-users Edge Function; turns its JSON { error } into a readable message */
async function callAdminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error instanceof FunctionsHttpError) {
    const j = await error.context.json().catch(() => null);
    return { error: (j as { error?: string } | null)?.error ?? error.message };
  }
  if (error) return { error: error.message.includes("Failed to send") ? "The admin-users function isn't deployed yet" : error.message };
  return { data };
}

function RoleSelect({ value, onChange, id }: { value: PanelRole; onChange: (r: PanelRole) => void; id?: string }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value as PanelRole)} className={select}>
      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  );
}

function BranchSelect({ value, onChange, branches, disabled }: { value: string; onChange: (v: string) => void; branches: Branch[]; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={cn(select, "disabled:opacity-50")} aria-label="Branch">
      <option value="">All branches</option>
      {branches.map((b) => <option key={b.id} value={b.id}>{b.name_en}</option>)}
    </select>
  );
}

function NewUser({ branches, onCreated }: { branches: Branch[]; onCreated: () => void }) {
  const [f, setF] = useState({ full_name: "", email: "", password: "", role: "cashier" as PanelRole, branch_id: branches[0]?.id ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    const r = await callAdminUsers({ action: "create", ...f, branch_id: f.branch_id || null });
    setBusy(false);
    if (r.error) return setError(r.error);
    setDone(`${f.full_name} can now sign in with ${f.email}`);
    setF({ ...f, full_name: "", email: "", password: "" });
    onCreated();
  };

  return (
    <Card>
      <form onSubmit={create} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-bold">
            Name
            <Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} maxLength={80} className="mt-1" />
          </label>
          <label className="block text-sm font-bold">
            Email (used to sign in)
            <Input required type="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="mt-1" />
          </label>
          <label className="block text-sm font-bold">
            Password (at least 8 characters)
            <Input required type="text" autoComplete="new-password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="mt-1" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-bold">
              Role
              <div className="mt-1"><RoleSelect value={f.role} onChange={(role) => setF({ ...f, role })} /></div>
            </label>
            <label className="block text-sm font-bold">
              Branch
              <div className="mt-1"><BranchSelect value={f.role === "admin" ? "" : f.branch_id} onChange={(branch_id) => setF({ ...f, branch_id })} branches={branches} disabled={f.role === "admin"} /></div>
            </label>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{ROLE_HINT[f.role]}. Give them the email and password; they sign in on this panel.</p>
        <ErrorNote message={error} />
        {done && <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm font-bold text-primary">{done}</p>}
        <Button type="submit" busy={busy}><UserPlus className="h-4 w-4" aria-hidden /> Create user</Button>
      </form>
    </Card>
  );
}

function PersonRow({ p, branches, self, onChanged }: { p: Person; branches: Branch[]; self: boolean; onChanged: () => void }) {
  const [role, setRole] = useState<PanelRole>(p.role === "customer" ? "cashier" : p.role);
  const [branch, setBranch] = useState(p.branch_id ?? "");
  const [active, setActive] = useState(p.is_active);
  const [pw, setPw] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const dirty = role !== p.role || (branch || null) !== p.branch_id || active !== p.is_active;

  const save = async (patch?: Partial<Person>) => {
    setBusy("save");
    setError("");
    setNote("");
    const body = patch ?? { role, branch_id: role === "admin" ? null : branch || null, is_active: active };
    const { error: err } = await supabase.from("profiles").update(body).eq("id", p.id);
    setBusy("");
    if (err) return setError(err.message);
    onChanged();
  };

  const resetPassword = async () => {
    if (!pw) return;
    setBusy("pw");
    setError("");
    const r = await callAdminUsers({ action: "set_password", user_id: p.id, password: pw });
    setBusy("");
    if (r.error) return setError(r.error);
    setPw(null);
    setNote("Password changed");
  };

  return (
    <Card className={cn(!p.is_active && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg text-primary">
            {p.full_name || "—"} {self && <span className="text-sm text-muted-foreground">(you)</span>}
          </p>
          <p className="truncate text-sm text-muted-foreground">{p.email}</p>
        </div>
        <div className="flex gap-1.5">
          <Badge tone={p.role === "admin" ? "dark" : p.role === "driver" ? "yellow" : "green"}>{ROLE_LABEL[p.role as PanelRole] ?? p.role}</Badge>
          {!p.is_active && <Badge tone="red">Switched off</Badge>}
        </div>
      </div>

      {self ? (
        <p className="mt-3 text-sm text-muted-foreground">You can&apos;t change your own role here, so you never lock yourself out.</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RoleSelect value={role} onChange={setRole} />
          <BranchSelect value={role === "admin" ? "" : branch} onChange={setBranch} branches={branches} disabled={role === "admin"} />
          <label className="flex items-center gap-2 px-2 text-sm font-bold">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-primary" /> Active
          </label>
          <Button size="sm" busy={busy === "save"} disabled={!dirty} onClick={() => save()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setPw(pw === null ? "" : null)}>
            <KeyRound className="h-4 w-4" aria-hidden /> Password
          </Button>
          <Button size="sm" variant="ghost" busy={busy === "save"} onClick={() => save({ role: "customer", branch_id: null })}>Remove access</Button>
        </div>
      )}
      {pw !== null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (8+ characters)" className="max-w-xs" autoComplete="new-password" />
          <Button size="sm" busy={busy === "pw"} disabled={pw.length < 8} onClick={resetPassword}>Set password</Button>
        </div>
      )}
      <div className="mt-2 space-y-2">
        <ErrorNote message={error} />
        {note && <p className="text-sm font-bold text-primary">{note}</p>}
      </div>
    </Card>
  );
}

/** Give a role to someone who already has an account (e.g. signed up on the website with Google). */
function Promote({ onChanged }: { onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PanelRole>("cashier");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ error: "", ok: "" });

  const promote = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ error: "", ok: "" });
    const { data, error } = await supabase.from("profiles").update({ role }).eq("email", email.trim().toLowerCase()).eq("role", "customer").select("id");
    setBusy(false);
    if (error) return setMsg({ error: error.message, ok: "" });
    if (!data?.length) return setMsg({ error: "No customer account with that email (or it already has a role — change it in the list).", ok: "" });
    setMsg({ error: "", ok: `${email.trim()} is now ${ROLE_LABEL[role]}. Set their branch in the list below.` });
    setEmail("");
    onChanged();
  };

  return (
    <Card>
      <form onSubmit={promote} className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1 text-sm font-bold">
          Existing account email
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
        </label>
        <RoleSelect value={role} onChange={setRole} />
        <Button type="submit" variant="outline" busy={busy}>Give access</Button>
      </form>
      <div className="mt-2">
        <ErrorNote message={msg.error} />
        {msg.ok && <p className="text-sm font-bold text-primary">{msg.ok}</p>}
      </div>
    </Card>
  );
}

export default function UsersPage() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [pr, br] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role, branch_id, is_active").neq("role", "customer").order("role").order("full_name"),
      supabase.from("branches").select("id, name_en").order("name_en"),
    ]);
    if (pr.error) return setError(pr.error.message);
    setError("");
    setPeople(pr.data as Person[]);
    setBranches((br.data as Branch[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const term = q.trim().toLowerCase();
  const shown = (people ?? []).filter((p) => !term || p.full_name.toLowerCase().includes(term) || p.email?.toLowerCase().includes(term));

  return (
    <AdminOnly>
      <PageHeader title="Users & roles" subtitle="Create logins for staff, cashiers and drivers, and change what each person can do." />

      <section className="mb-8">
        <h2 className="mb-3 text-xl text-primary">New user</h2>
        {people ? <NewUser branches={branches} onCreated={load} /> : <Spinner />}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl text-primary">Give access to an existing account</h2>
        <Promote onChanged={load} />
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl text-primary">Team ({people?.length ?? 0})</h2>
          <label className="relative block w-full max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="ps-9" aria-label="Search team" />
          </label>
        </div>
        <ErrorNote message={error} />
        {!people ? (
          <Spinner />
        ) : (
          <div className="space-y-3">
            {shown.map((p) => (
              <PersonRow key={`${p.id}-${p.role}-${p.branch_id}-${p.is_active}`} p={p} branches={branches} self={p.id === profile?.id} onChanged={load} />
            ))}
          </div>
        )}
      </section>
    </AdminOnly>
  );
}
