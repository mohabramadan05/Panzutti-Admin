"use client";
/* eslint-disable @next/next/no-img-element -- preview of a local file / remote menu photo */

import { useEffect, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { friendlyDbError, slugify, type AddonRow, type CategoryRow, type GroupRow, type MenuItemRow } from "@/lib/menu-types";
import { Check, Field, Modal } from "./modal";
import { Button, ErrorNote, Input } from "./ui";

const MENU_BUCKET = "menu-images"; // public bucket, admins only can write (storage policies)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const toPiasters = (egp: string) => Math.round(Number(egp) * 100);
const validMoney = (egp: string) => egp.trim() !== "" && Number.isFinite(Number(egp)) && Number(egp) >= 0;

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className="w-full resize-y rounded-xl bg-background px-3.5 py-2.5 ring-1 ring-border outline-none focus:ring-2 focus:ring-primary" />;
}

function Footer({ busy, onClose, label = "Save" }: { busy: boolean; onClose: () => void; label?: string }) {
  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button type="submit" busy={busy}>{label}</Button>
    </div>
  );
}

/* ------------------------------------------------------------------ categories */

export function CategoryEditor({ category, nextSort, onClose, onSaved }: { category?: CategoryRow; nextSort: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name_en: category?.name_en ?? "",
    name_ar: category?.name_ar ?? "",
    slug: category?.slug ?? "",
    sort_order: String(category?.sort_order ?? nextSort),
    is_active: category?.is_active ?? true,
  });
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string | boolean) => setF((cur) => ({ ...cur, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name_en.trim() || !f.name_ar.trim()) return setError("English and Arabic names are both required.");
    const slug = slugify(f.slug || f.name_en);
    if (!slug) return setError("Add a web address (slug) using English letters.");
    setBusy(true);
    setError("");
    const row = { name_en: f.name_en.trim(), name_ar: f.name_ar.trim(), slug, sort_order: Number(f.sort_order) || 0, is_active: f.is_active };
    const { error: err } = category ? await supabase.from("menu_categories").update(row).eq("id", category.id) : await supabase.from("menu_categories").insert(row);
    setBusy(false);
    if (err) return setError(friendlyDbError(err.message));
    onSaved();
  };

  return (
    <Modal title={category ? `Edit category` : "New category"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)">
            <Input value={f.name_en} onChange={(e) => { set("name_en", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} required />
          </Field>
          <Field label="Name (Arabic)">
            <Input dir="rtl" value={f.name_ar} onChange={(e) => set("name_ar", e.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Web address (slug)" hint="Used in the menu link, e.g. #side-bites">
            <Input value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} dir="ltr" />
          </Field>
          <Field label="Order" hint="Lower numbers show first">
            <Input type="number" value={f.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
          </Field>
        </div>
        <Check label="Show on the website" checked={f.is_active} onChange={(v) => set("is_active", v)} />
        <ErrorNote message={error} />
        <Footer busy={busy} onClose={onClose} label={category ? "Save changes" : "Add category"} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ items */

export function ItemEditor({
  item,
  categories,
  groups,
  defaultCategoryId,
  onClose,
  onSaved,
}: {
  item?: MenuItemRow;
  categories: CategoryRow[];
  groups: GroupRow[];
  defaultCategoryId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState({
    name_en: item?.name_en ?? "",
    name_ar: item?.name_ar ?? "",
    slug: item?.slug ?? "",
    category_id: item?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? "",
    price: item ? String(item.price / 100) : "",
    description_en: item?.description_en ?? "",
    description_ar: item?.description_ar ?? "",
    image_url: item?.image_url ?? "",
    sort_order: String(item?.sort_order ?? (categories.find((c) => c.id === (defaultCategoryId ?? categories[0]?.id))?.menu_items.length ?? 0) + 1),
    is_active: item?.is_active ?? true,
    is_signature: item?.is_signature ?? false,
    suggest_at_checkout: item?.suggest_at_checkout ?? false,
  });
  const [linked, setLinked] = useState<string[]>(item?.menu_item_addon_groups.map((g) => g.group_id) ?? []);
  const [slugTouched, setSlugTouched] = useState(!!item);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string | boolean) => setF((cur) => ({ ...cur, [k]: v }));

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pickFile = (fl: File | null) => {
    setError("");
    if (!fl) return;
    if (!fl.type.startsWith("image/")) return setError("Please choose an image file.");
    if (fl.size > MAX_IMAGE_BYTES) return setError("That image is larger than 5 MB.");
    setFile(fl);
    setPreview(URL.createObjectURL(fl));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name_en.trim() || !f.name_ar.trim()) return setError("English and Arabic names are both required.");
    if (!validMoney(f.price)) return setError("Enter a price in EGP (0 or more).");
    if (!f.category_id) return setError("Choose a category.");
    const slug = slugify(f.slug || f.name_en);
    if (!slug) return setError("Add a web address (slug) using English letters.");
    setBusy(true);
    setError("");

    // 1) photo: upload a new file to the public menu-images bucket
    let image_url = f.image_url.trim() || null;
    if (file) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `items/${slug}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from(MENU_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) {
        setBusy(false);
        return setError(`Photo upload failed: ${up.error.message}`);
      }
      image_url = supabase.storage.from(MENU_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    // 2) the item itself
    const row = {
      name_en: f.name_en.trim(),
      name_ar: f.name_ar.trim(),
      slug,
      category_id: f.category_id,
      price: toPiasters(f.price),
      description_en: f.description_en.trim() || null,
      description_ar: f.description_ar.trim() || null,
      image_url,
      sort_order: Number(f.sort_order) || 0,
      is_active: f.is_active,
      is_signature: f.is_signature,
      suggest_at_checkout: f.suggest_at_checkout,
    };
    const res = item
      ? await supabase.from("menu_items").update(row).eq("id", item.id).select("id").single()
      : await supabase.from("menu_items").insert(row).select("id").single();
    if (res.error || !res.data) {
      setBusy(false);
      return setError(friendlyDbError(res.error?.message ?? "Couldn't save the item."));
    }
    const id = (res.data as { id: string }).id;

    // 3) which add-on groups this item offers
    const before = item?.menu_item_addon_groups.map((g) => g.group_id) ?? [];
    const removed = before.filter((g) => !linked.includes(g));
    const added = linked.filter((g) => !before.includes(g));
    if (removed.length) {
      const r = await supabase.from("menu_item_addon_groups").delete().eq("menu_item_id", id).in("group_id", removed);
      if (r.error) {
        setBusy(false);
        return setError(r.error.message);
      }
    }
    if (added.length) {
      const r = await supabase.from("menu_item_addon_groups").insert(added.map((group_id) => ({ menu_item_id: id, group_id, sort_order: linked.indexOf(group_id) })));
      if (r.error) {
        setBusy(false);
        return setError(r.error.message);
      }
    }
    setBusy(false);
    onSaved();
  };

  const shownImage = preview ?? (f.image_url || null);

  return (
    <Modal title={item ? `Edit ${item.name_en}` : "New menu item"} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-5 md:grid-cols-[1fr_200px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name (English)">
                <Input value={f.name_en} onChange={(e) => { set("name_en", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} required />
              </Field>
              <Field label="Name (Arabic)">
                <Input dir="rtl" value={f.name_ar} onChange={(e) => set("name_ar", e.target.value)} required />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Category">
                <select value={f.category_id} onChange={(e) => set("category_id", e.target.value)} className="h-11 w-full rounded-xl bg-background px-3 ring-1 ring-border">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name_en}</option>
                  ))}
                </select>
              </Field>
              <Field label="Price (EGP)">
                <Input type="number" min={0} step="0.5" value={f.price} onChange={(e) => set("price", e.target.value)} required />
              </Field>
              <Field label="Order in category">
                <Input type="number" value={f.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
              </Field>
            </div>
            <Field label="Web address (slug)" hint={`Item page: /menu/${slugify(f.slug || f.name_en) || "…"}`}>
              <Input value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value); }} dir="ltr" />
            </Field>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-bold">Photo</span>
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-border bg-background text-center text-sm font-bold text-primary hover:border-primary">
              {shownImage ? <img src={shownImage} alt="" className="h-full w-full object-cover" /> : (<><ImagePlus className="h-8 w-8" aria-hidden /> Upload photo</>)}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </label>
            {shownImage && (
              <button type="button" onClick={() => { setFile(null); setPreview(null); set("image_url", ""); }} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-brand-red">
                <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove photo
              </button>
            )}
            <Input className="mt-2 h-9 text-xs" placeholder="…or paste an image URL" value={file ? "" : f.image_url} disabled={!!file} onChange={(e) => set("image_url", e.target.value)} dir="ltr" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Description (English)">
            <Textarea value={f.description_en} onChange={(e) => set("description_en", e.target.value)} />
          </Field>
          <Field label="Description (Arabic)">
            <Textarea dir="rtl" value={f.description_ar} onChange={(e) => set("description_ar", e.target.value)} />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-bold">Add-on groups offered with this item</legend>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No add-on groups yet — create one in the Add-ons panel.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => {
                const on = linked.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setLinked((l) => (on ? l.filter((x) => x !== g.id) : [...l, g.id]))}
                    className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition ${on ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-border hover:ring-primary"}`}
                  >
                    {g.name_en}
                    <span className="ms-1 opacity-70">{g.min_select > 0 ? "· required" : "· optional"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Check label="Show on the website" checked={f.is_active} onChange={(v) => set("is_active", v)} />
          <Check label="Signature (star badge)" checked={f.is_signature} onChange={(v) => set("is_signature", v)} />
          <Check label="Suggest at checkout" checked={f.suggest_at_checkout} onChange={(v) => set("suggest_at_checkout", v)} />
        </div>

        <ErrorNote message={error} />
        <Footer busy={busy} onClose={onClose} label={item ? "Save changes" : "Add item"} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ add-on groups */

export function GroupEditor({ group, onClose, onSaved }: { group?: GroupRow; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name_en: group?.name_en ?? "",
    name_ar: group?.name_ar ?? "",
    min_select: String(group?.min_select ?? 0),
    max_select: String(group?.max_select ?? 1),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const min = Number(f.min_select);
  const max = Number(f.max_select);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name_en.trim() || !f.name_ar.trim()) return setError("English and Arabic names are both required.");
    if (!(min >= 0) || !(max >= 1) || max < min) return setError("“Max choices” must be at least 1 and not lower than “min choices”.");
    setBusy(true);
    setError("");
    const row = { name_en: f.name_en.trim(), name_ar: f.name_ar.trim(), min_select: min, max_select: max };
    const { error: err } = group ? await supabase.from("addon_groups").update(row).eq("id", group.id) : await supabase.from("addon_groups").insert(row);
    setBusy(false);
    if (err) return setError(friendlyDbError(err.message));
    onSaved();
  };

  return (
    <Modal title={group ? "Edit add-on group" : "New add-on group"} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)" hint="e.g. Choose a side, Extra sauce">
            <Input value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required />
          </Field>
          <Field label="Name (Arabic)">
            <Input dir="rtl" value={f.name_ar} onChange={(e) => set("name_ar", e.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Min choices" hint="0 = optional, 1 or more = customer must choose">
            <Input type="number" min={0} value={f.min_select} onChange={(e) => set("min_select", e.target.value)} />
          </Field>
          <Field label="Max choices" hint="1 = pick one (radio buttons)">
            <Input type="number" min={1} value={f.max_select} onChange={(e) => set("max_select", e.target.value)} />
          </Field>
        </div>
        <p className="rounded-xl bg-muted px-3 py-2 text-sm">
          Customers will see: <b>{min > 0 ? "Required" : "Optional"}</b> ·{" "}
          {max === 1 ? "Choose 1" : min === 0 ? `Choose up to ${max || "?"}` : `Choose ${min}–${max || "?"}`}
        </p>
        <ErrorNote message={error} />
        <Footer busy={busy} onClose={onClose} label={group ? "Save changes" : "Add group"} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ add-ons */

export function AddonEditor({ addon, group, onClose, onSaved }: { addon?: AddonRow; group: GroupRow; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name_en: addon?.name_en ?? "",
    name_ar: addon?.name_ar ?? "",
    price: addon ? String(addon.price / 100) : "0",
    max_quantity: String(addon?.max_quantity ?? 1),
    sort_order: String(addon?.sort_order ?? group.addons.length + 1),
    is_default: addon?.is_default ?? false,
    is_active: addon?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string | boolean) => setF((cur) => ({ ...cur, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name_en.trim() || !f.name_ar.trim()) return setError("English and Arabic names are both required.");
    if (!validMoney(f.price)) return setError("Enter a price in EGP (0 = free).");
    if (!(Number(f.max_quantity) >= 1)) return setError("Max quantity must be at least 1.");
    setBusy(true);
    setError("");
    const row = {
      group_id: group.id,
      name_en: f.name_en.trim(),
      name_ar: f.name_ar.trim(),
      price: toPiasters(f.price),
      max_quantity: Number(f.max_quantity),
      sort_order: Number(f.sort_order) || 0,
      is_default: f.is_default,
      is_active: f.is_active,
    };
    const { error: err } = addon ? await supabase.from("addons").update(row).eq("id", addon.id) : await supabase.from("addons").insert(row);
    setBusy(false);
    if (err) return setError(friendlyDbError(err.message));
    onSaved();
  };

  return (
    <Modal title={addon ? `Edit ${addon.name_en}` : `New add-on in “${group.name_en}”`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name (English)">
            <Input value={f.name_en} onChange={(e) => set("name_en", e.target.value)} required />
          </Field>
          <Field label="Name (Arabic)">
            <Input dir="rtl" value={f.name_ar} onChange={(e) => set("name_ar", e.target.value)} required />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Extra price (EGP)" hint="0 = free">
            <Input type="number" min={0} step="0.5" value={f.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label="Max quantity" hint="How many of it per item">
            <Input type="number" min={1} value={f.max_quantity} onChange={(e) => set("max_quantity", e.target.value)} />
          </Field>
          <Field label="Order">
            <Input type="number" value={f.sort_order} onChange={(e) => set("sort_order", e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Check label="Pre-selected by default" checked={f.is_default} onChange={(v) => set("is_default", v)} />
          <Check label="Available on the website" checked={f.is_active} onChange={(v) => set("is_active", v)} />
        </div>
        <ErrorNote message={error} />
        <Footer busy={busy} onClose={onClose} label={addon ? "Save changes" : "Add add-on"} />
      </form>
    </Modal>
  );
}
