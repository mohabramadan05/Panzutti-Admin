"use client";
/* eslint-disable @next/next/no-img-element -- public URLs from the team-photos bucket */

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Trash2, Upload, UserRound } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const BUCKET = "team-photos";
const MAX_BYTES = 8 * 1024 * 1024;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

type TeamPhoto = {
  id: string;
  file_path: string;
  name: string | null;
  role_en: string | null;
  role_ar: string | null;
  sort_order: number;
  is_active: boolean;
};

const publicUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** Upload one photo: file into the public bucket, then a team_photos row. */
function UploadForm({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [roleEn, setRoleEn] = useState("");
  const [roleAr, setRoleAr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const upload = async () => {
    if (!file) return setError("Choose a photo first");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!TYPES[ext]) return setError("Photos must be JPG, PNG or WebP");
    if (file.size > MAX_BYTES) return setError("Photos must be 8 MB or smaller");
    setBusy(true);
    setError("");
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: TYPES[ext] });
    if (upErr) {
      setBusy(false);
      return setError(upErr.message);
    }
    const { error: err } = await supabase.from("team_photos").insert({
      file_path: path,
      name: name.trim() || null,
      role_en: roleEn.trim() || null,
      role_ar: roleAr.trim() || null,
    });
    setBusy(false);
    if (err) {
      await supabase.storage.from(BUCKET).remove([path]);
      return setError(err.message);
    }
    setFile(null);
    setName("");
    setRoleEn("");
    setRoleAr("");
    if (fileRef.current) fileRef.current.value = "";
    onDone();
  };

  return (
    <Card className="mb-6 space-y-4">
      <p className="font-bold">Add a photo</p>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm file:me-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-primary-foreground"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block text-sm font-bold">
          Name (optional)
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="e.g. Ahmed" />
        </label>
        <label className="block text-sm font-bold">
          Role in English (optional)
          <Input value={roleEn} onChange={(e) => setRoleEn(e.target.value)} className="mt-1" placeholder="e.g. Head chef" />
        </label>
        <label className="block text-sm font-bold">
          Role in Arabic (optional)
          <Input dir="rtl" value={roleAr} onChange={(e) => setRoleAr(e.target.value)} className="mt-1" placeholder="مثلاً: الشيف" />
        </label>
      </div>
      <ErrorNote message={error} />
      <Button onClick={upload} busy={busy}>
        <Upload className="h-4 w-4" aria-hidden /> Upload
      </Button>
    </Card>
  );
}

function PhotoCard({ p, onDone }: { p: TeamPhoto; onDone: () => void }) {
  const [order, setOrder] = useState(String(p.sort_order));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const update = async (patch: Partial<TeamPhoto>, key: string) => {
    setBusy(key);
    setError("");
    const { error: err } = await supabase.from("team_photos").update(patch).eq("id", p.id);
    setBusy(null);
    if (err) return setError(err.message);
    onDone();
  };

  const remove = async () => {
    setBusy("d");
    setError("");
    const { error: err } = await supabase.from("team_photos").delete().eq("id", p.id);
    if (err) {
      setBusy(null);
      return setError(err.message);
    }
    await supabase.storage.from(BUCKET).remove([p.file_path]);
    onDone();
  };

  return (
    <Card className="flex flex-col p-3">
      <a href={publicUrl(p.file_path)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl bg-muted">
        <img src={publicUrl(p.file_path)} alt={p.name ?? "Team photo"} className="aspect-[4/5] w-full object-cover" loading="lazy" />
      </a>
      <div className="mt-3 flex-1 space-y-1 text-sm">
        <Badge tone={p.is_active ? "green" : "dark"}>{p.is_active ? "on the website" : "hidden"}</Badge>
        {p.name && <p className="font-bold">{p.name}</p>}
        {(p.role_en || p.role_ar) && (
          <p className="text-muted-foreground">
            {p.role_en}
            {p.role_en && p.role_ar && " · "}
            <span dir="rtl">{p.role_ar}</span>
          </p>
        )}
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm font-bold">
        Order
        <Input type="number" value={order} onChange={(e) => setOrder(e.target.value)} className="w-20" />
        {String(p.sort_order) !== order && (
          <Button size="sm" variant="outline" busy={busy === "o"} onClick={() => update({ sort_order: Math.trunc(Number(order) || 0) }, "o")}>
            Save
          </Button>
        )}
      </label>
      <ErrorNote message={error} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" busy={busy === "a"} onClick={() => update({ is_active: !p.is_active }, "a")}>
          {p.is_active ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />} {p.is_active ? "Hide" : "Show"}
        </Button>
        <Button size="sm" variant="danger" busy={busy === "d"} onClick={remove}>
          <Trash2 className="h-4 w-4" aria-hidden /> Delete
        </Button>
      </div>
    </Card>
  );
}

function TeamGallery() {
  const [photos, setPhotos] = useState<TeamPhoto[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("team_photos")
      .select("id, file_path, name, role_en, role_ar, sort_order, is_active")
      .order("sort_order")
      .order("created_at", { ascending: false });
    if (err) return setError(`${err.message} (has the v7 SQL been run?)`);
    setPhotos((data ?? []) as TeamPhoto[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <UploadForm onDone={load} />
      <ErrorNote message={error} />
      {!photos ? (
        !error && <div className="flex justify-center py-16"><Spinner /></div>
      ) : photos.length === 0 ? (
        <Empty title="No team photos yet" hint="Upload the first one above." icon={<UserRound className="h-8 w-8" />} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {photos.map((p) => (
            <PhotoCard key={`${p.id}-${p.sort_order}`} p={p} onDone={load} />
          ))}
        </div>
      )}
    </>
  );
}

export default function TeamPage() {
  useEffect(() => {
    document.title = "Team gallery · Panzutti Admin";
  }, []);
  return (
    <>
      <PageHeader title="Team gallery" subtitle="Photos of the Panzutti team. Visible ones appear on the website's Team page within 5 minutes; lower order numbers come first." />
      <AdminOnly>
        <TeamGallery />
      </AdminOnly>
    </>
  );
}
