"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, Download, Mail, Phone, Truck, Users } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { Badge, Card, Empty, ErrorNote, PageHeader, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { cn, dateTime, localPhone } from "@/lib/utils";

const STATUSES = ["new", "reviewing", "contacted", "accepted", "rejected"] as const;
type Status = (typeof STATUSES)[number];

type Application = {
  id: string;
  type: "job" | "service_provider";
  full_name: string;
  phone: string;
  email: string;
  position_other: string | null;
  company_name: string | null;
  message: string | null;
  attachment_path: string | null;
  status: Status;
  staff_note: string | null;
  created_at: string;
  job_positions: { title_en: string } | null;
  service_categories: { name_en: string } | null;
};

function ApplicationCard({ a, onChanged }: { a: Application; onChanged: () => void }) {
  const [note, setNote] = useState(a.staff_note ?? "");
  const [error, setError] = useState("");

  const update = async (patch: Partial<Pick<Application, "status" | "staff_note">>) => {
    setError("");
    const { error: err } = await supabase.from("applications").update(patch).eq("id", a.id);
    if (err) return setError(err.message);
    onChanged();
  };

  const download = async () => {
    if (!a.attachment_path) return;
    const { data, error: err } = await supabase.storage.from("applications").createSignedUrl(a.attachment_path, 60 * 5);
    if (err || !data) return setError(err?.message ?? "Couldn't open the file");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const what = a.type === "job" ? a.job_positions?.title_en ?? a.position_other ?? "Job" : a.service_categories?.name_en ?? "Supplier";

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {a.type === "job" ? <Briefcase className="h-4 w-4 text-primary" aria-hidden /> : <Truck className="h-4 w-4 text-primary" aria-hidden />}
            <p className="font-display text-lg text-primary">{a.full_name}</p>
            <Badge tone={a.status === "new" ? "red" : a.status === "accepted" ? "green" : "muted"}>{a.status}</Badge>
          </div>
          <p className="text-sm font-bold">{what}{a.company_name && ` · ${a.company_name}`}</p>
          <p className="text-xs text-muted-foreground">{dateTime(a.created_at)}</p>
        </div>
        <select
          value={a.status}
          onChange={(e) => update({ status: e.target.value as Status })}
          aria-label="Status"
          className="h-9 rounded-full bg-background px-3 text-sm font-bold capitalize ring-1 ring-border"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 font-bold text-primary hover:underline">
          <Phone className="h-4 w-4" aria-hidden /> <span dir="ltr">{localPhone(a.phone)}</span>
        </a>
        <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 font-bold text-primary hover:underline">
          <Mail className="h-4 w-4" aria-hidden /> {a.email}
        </a>
        {a.attachment_path && (
          <button type="button" onClick={download} className="inline-flex items-center gap-1 font-bold text-primary hover:underline">
            <Download className="h-4 w-4" aria-hidden /> CV / attachment
          </button>
        )}
      </div>
      {a.message && <p className="mt-3 whitespace-pre-line rounded-xl bg-muted p-3 text-sm">{a.message}</p>}
      <label className="mt-3 block">
        <span className="sr-only">Internal note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (a.staff_note ?? "") && update({ staff_note: note.trim() || null })}
          rows={2}
          placeholder="Internal note (saved when you click away)"
          className="w-full resize-none rounded-xl bg-background px-3 py-2 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      <ErrorNote message={error} />
    </Card>
  );
}

function Applications() {
  const [type, setType] = useState<"all" | "job" | "service_provider">("all");
  const [status, setStatus] = useState<Status | "open">("open");
  const [rows, setRows] = useState<Application[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    let q = supabase
      .from("applications")
      .select("id, type, full_name, phone, email, position_other, company_name, message, attachment_path, status, staff_note, created_at, job_positions(title_en), service_categories(name_en)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (type !== "all") q = q.eq("type", type);
    q = status === "open" ? q.in("status", ["new", "reviewing", "contacted"]) : q.eq("status", status);
    const { data, error: err } = await q;
    if (err) return setError(err.message);
    setError("");
    setRows((data ?? []) as unknown as Application[]);
  }, [type, status]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2">
        {([["all", "All"], ["job", "Jobs"], ["service_provider", "Suppliers"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setType(v)} className={cn("rounded-full px-4 py-2 text-sm font-bold", type === v ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border")}>
            {l}
          </button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value as Status | "open")} aria-label="Filter by status" className="h-9 rounded-full bg-card px-3 text-sm font-bold capitalize ring-1 ring-border">
          <option value="open">Open (new, reviewing, contacted)</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <ErrorNote message={error} />
      {!rows ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Empty title="No applications here" icon={<Users className="h-8 w-8" />} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((a) => (
            <ApplicationCard key={a.id} a={a} onChanged={load} />
          ))}
        </div>
      )}
    </>
  );
}

export default function ApplicationsPage() {
  useEffect(() => {
    document.title = "Applications · Panzutti Admin";
  }, []);
  return (
    <>
      <PageHeader title="Applications" subtitle="Join our team and supplier forms from the website." />
      <AdminOnly>
        <Applications />
      </AdminOnly>
    </>
  );
}
