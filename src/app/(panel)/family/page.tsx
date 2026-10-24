"use client";
/* eslint-disable @next/next/no-img-element -- signed URLs from the private gallery bucket */

import { useCallback, useEffect, useState } from "react";
import { Camera, Check, X } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { cn, dateTime } from "@/lib/utils";

type Photo = {
  id: string;
  file_path: string;
  caption: string | null;
  uploader_name: string | null;
  is_official: boolean;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
  url?: string;
};

function PhotoCard({ p, onDone }: { p: Photo; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const review = async (approve: boolean) => {
    setBusy(approve ? "a" : "r");
    setError("");
    const { error: err } = await supabase.rpc("review_family_photo", { p_photo_id: p.id, p_approve: approve, p_note: note.trim() || null });
    setBusy(null);
    if (err) return setError(err.message);
    onDone();
  };

  return (
    <Card className="flex flex-col p-3">
      <a href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-muted">
        {p.url ? <img src={p.url} alt={p.caption ?? "Family photo"} className="aspect-square w-full object-cover" loading="lazy" /> : <div className="aspect-square" />}
      </a>
      <div className="mt-3 flex-1 space-y-1 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={p.status === "approved" ? "green" : p.status === "rejected" ? "dark" : "yellow"}>{p.status}</Badge>
          {p.file_path.startsWith("guest/") && <Badge>guest</Badge>}
          {p.is_official && <Badge tone="red">official</Badge>}
        </div>
        {p.caption && <p className="font-bold">“{p.caption}”</p>}
        <p className="text-muted-foreground">{p.uploader_name ?? "—"} · {dateTime(p.created_at)}</p>
        {p.review_note && <p className="text-muted-foreground">Note: {p.review_note}</p>}
      </div>
      {rejecting && <Input autoFocus className="mt-2" placeholder="Reason (optional, internal)" value={note} onChange={(e) => setNote(e.target.value)} />}
      <ErrorNote message={error} />
      <div className="mt-3 flex flex-wrap gap-2">
        {p.status !== "approved" && !rejecting && (
          <Button size="sm" busy={busy === "a"} onClick={() => review(true)}>
            <Check className="h-4 w-4" aria-hidden /> Approve
          </Button>
        )}
        {p.status !== "rejected" &&
          (rejecting ? (
            <>
              <Button size="sm" variant="danger" busy={busy === "r"} onClick={() => review(false)}>{p.status === "approved" ? "Remove" : "Reject"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
              <X className="h-4 w-4" aria-hidden /> {p.status === "approved" ? "Remove from wall" : "Reject"}
            </Button>
          ))}
      </div>
    </Card>
  );
}

function FamilyReview() {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("family_photos")
      .select("id, file_path, caption, uploader_name, is_official, status, review_note, created_at")
      .eq("status", tab)
      .order("created_at", { ascending: tab === "pending" })
      .limit(60);
    if (err) return setError(err.message);
    const rows = (data ?? []) as Photo[];
    const { data: signed } = rows.length
      ? await supabase.storage.from("panzutti-family").createSignedUrls(rows.map((r) => r.file_path), 60 * 30)
      : { data: [] };
    setPhotos(rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? undefined })));
  }, [tab]);

  useEffect(() => {
    setPhotos(null);
    load();
  }, [load]);

  return (
    <>
      <div role="tablist" className="mb-5 flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn("rounded-full px-4 py-2 text-sm font-bold capitalize", tab === t ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border")}
          >
            {t === "pending" ? "To review" : t === "approved" ? "On the wall" : "Rejected"}
          </button>
        ))}
      </div>
      <ErrorNote message={error} />
      {!photos ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : photos.length === 0 ? (
        <Empty title="No photos here" icon={<Camera className="h-8 w-8" />} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {photos.map((p) => (
            <PhotoCard key={p.id} p={p} onDone={load} />
          ))}
        </div>
      )}
    </>
  );
}

export default function FamilyPage() {
  useEffect(() => {
    document.title = "Family photos · Panzutti Admin";
  }, []);
  return (
    <>
      <PageHeader title="Panzutti Family" subtitle="Approved photos appear on the website's family wall within 5 minutes." />
      <AdminOnly>
        <FamilyReview />
      </AdminOnly>
    </>
  );
}
