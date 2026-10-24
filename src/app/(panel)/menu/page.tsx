"use client";
/* eslint-disable @next/next/no-img-element -- menu photos are remote (Cloudinary / Supabase) */

import { useCallback, useEffect, useMemo, useState } from "react";
import { EyeOff, ImageOff, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmDelete } from "@/components/modal";
import { AddonEditor, CategoryEditor, GroupEditor, ItemEditor } from "@/components/menu-editors";
import { Badge, Button, Card, ErrorNote, Input, PageHeader, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { friendlyDbError, type AddonRow, type CategoryRow, type GroupRow, type MenuItemRow } from "@/lib/menu-types";
import { supabase } from "@/lib/supabase";
import { cn, egp } from "@/lib/utils";

type Editing =
  | { kind: "category"; category?: CategoryRow }
  | { kind: "item"; item?: MenuItemRow; categoryId?: string }
  | { kind: "group"; group?: GroupRow }
  | { kind: "addon"; group: GroupRow; addon?: AddonRow }
  | null;

type Deleting =
  | { kind: "category"; row: CategoryRow }
  | { kind: "item"; row: MenuItemRow }
  | { kind: "group"; row: GroupRow }
  | { kind: "addon"; row: AddonRow }
  | null;

function Toggle({ on, onChange, busy, label }: { on: boolean; onChange: (v: boolean) => void; busy?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", on ? "bg-brand-red" : "bg-primary")}
    >
      <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-brand-cream shadow transition-all", on ? "start-6" : "start-1")} />
    </button>
  );
}

function IconButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={cn("rounded-full p-2 hover:bg-muted", danger ? "text-brand-red" : "text-muted-foreground hover:text-primary")}>
      {children}
    </button>
  );
}

const ITEM_COLS = "id, category_id, slug, name_en, name_ar, description_en, description_ar, price, image_url, is_signature, is_sold_out, is_active, suggest_at_checkout, sort_order, menu_item_addon_groups(group_id)";

export default function MenuPage() {
  const { isAdmin } = useAuth();
  const [cats, setCats] = useState<CategoryRow[] | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    const [c, g] = await Promise.all([
      supabase.from("menu_categories").select(`id, slug, name_en, name_ar, sort_order, is_active, menu_items(${ITEM_COLS})`).order("sort_order"),
      supabase.from("addon_groups").select("id, name_en, name_ar, min_select, max_select, addons(id, group_id, name_en, name_ar, price, max_quantity, is_default, is_sold_out, is_active, sort_order)").order("name_en"),
    ]);
    if (c.error) return setError(c.error.message);
    setCats(((c.data ?? []) as CategoryRow[]).map((x) => ({ ...x, menu_items: [...x.menu_items].sort((a, b) => a.sort_order - b.sort_order) })));
    setGroups(((g.data ?? []) as GroupRow[]).map((x) => ({ ...x, addons: [...x.addons].sort((a, b) => a.sort_order - b.sort_order) })));
  }, []);

  useEffect(() => {
    document.title = "Menu · Panzutti Admin";
    load();
  }, [load]);

  const act = async (id: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusyId(id);
    setError("");
    const { error: err } = await fn();
    setBusyId(null);
    if (err) setError(friendlyDbError(err.message));
    load();
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (cats ?? [])
      .map((c) => ({ ...c, menu_items: c.menu_items.filter((i) => !term || i.name_en.toLowerCase().includes(term) || i.name_ar.includes(term)) }))
      .filter((c) => !term || c.menu_items.length > 0);
  }, [cats, q]);

  /** How many items offer each add-on group (shown in the delete warning). */
  const groupUse = useMemo(() => {
    const m: Record<string, number> = {};
    (cats ?? []).flatMap((c) => c.menu_items).forEach((i) => i.menu_item_addon_groups.forEach((l) => (m[l.group_id] = (m[l.group_id] ?? 0) + 1)));
    return m;
  }, [cats]);

  const soldOutCount = (cats ?? []).flatMap((c) => c.menu_items).filter((i) => i.is_sold_out).length;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError("");
    const table = { category: "menu_categories", item: "menu_items", group: "addon_groups", addon: "addons" }[deleting.kind];
    const { error: err } = await supabase.from(table).delete().eq("id", deleting.row.id);
    if (!err && deleting.kind === "item") {
      // tidy up a photo we uploaded ourselves (Cloudinary links are left alone)
      const marker = "/storage/v1/object/public/menu-images/";
      const url = deleting.row.image_url ?? "";
      if (url.includes(marker)) await supabase.storage.from("menu-images").remove([decodeURIComponent(url.split(marker)[1])]);
    }
    setDeleteBusy(false);
    if (err) return setDeleteError(friendlyDbError(err.message));
    setDeleting(null);
    load();
  };

  const saved = () => {
    setEditing(null);
    load();
  };

  const nextCategorySort = Math.max(0, ...(cats ?? []).map((c) => c.sort_order)) + 1;

  return (
    <>
      <PageHeader
        title="Menu"
        subtitle={`Checkout picks up changes at once; the website's menu page within 5 minutes.${soldOutCount ? ` ${soldOutCount} sold out now.` : ""}`}
        actions={
          <>
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" className="w-56 ps-9" />
            </label>
            {isAdmin && (
              <>
                <Button variant="outline" onClick={() => setEditing({ kind: "category" })}>
                  <Plus className="h-4 w-4" aria-hidden /> Category
                </Button>
                <Button onClick={() => setEditing({ kind: "item" })} disabled={!cats?.length}>
                  <Plus className="h-4 w-4" aria-hidden /> Item
                </Button>
              </>
            )}
          </>
        }
      />
      <ErrorNote message={error} />

      {!cats ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[1.6fr_1fr]">
          {/* ---------------------------------------------------------- categories + items */}
          <div className="space-y-6">
            {filtered.map((c) => (
              <Card key={c.id} className={cn("p-0", !c.is_active && "opacity-70")}>
                <div className="flex items-center gap-2 border-b border-border px-5 py-3">
                  <h2 className="flex-1 text-lg text-primary">
                    {c.name_en} <span className="ms-1 text-sm font-normal text-muted-foreground" dir="rtl">{c.name_ar}</span>
                  </h2>
                  {!c.is_active && <Badge tone="dark">hidden</Badge>}
                  <span className="text-xs text-muted-foreground">{c.menu_items.length} items</span>
                  {isAdmin && (
                    <>
                      <IconButton label={`Add item to ${c.name_en}`} onClick={() => setEditing({ kind: "item", categoryId: c.id })}><Plus className="h-4 w-4" /></IconButton>
                      <IconButton label={`Edit ${c.name_en}`} onClick={() => setEditing({ kind: "category", category: c })}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label={`Delete ${c.name_en}`} danger onClick={() => { setDeleteError(""); setDeleting({ kind: "category", row: c }); }}><Trash2 className="h-4 w-4" /></IconButton>
                    </>
                  )}
                </div>
                {c.menu_items.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">No items in this category yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {c.menu_items.map((i) => (
                      <li key={i.id} className={cn("flex items-center gap-3 px-5 py-3", !i.is_active && "opacity-50")}>
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {i.image_url ? <img src={i.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageOff className="m-3 h-6 w-6 text-muted-foreground" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">
                            {i.name_en} {i.is_signature && <span className="text-brand-red">★</span>}
                          </p>
                          <p className="truncate text-sm text-muted-foreground" dir="rtl">{i.name_ar}</p>
                        </div>
                        <span className="hidden text-sm font-bold tabular-nums sm:block">{egp(i.price)}</span>
                        {!i.is_active && <Badge tone="dark">hidden</Badge>}
                        {isAdmin && (
                          <div className="flex">
                            <IconButton label={`Edit ${i.name_en}`} onClick={() => setEditing({ kind: "item", item: i })}><Pencil className="h-4 w-4" /></IconButton>
                            <IconButton label={i.is_active ? `Hide ${i.name_en}` : `Show ${i.name_en}`} onClick={() => act(i.id, () => supabase.from("menu_items").update({ is_active: !i.is_active }).eq("id", i.id))}>
                              <EyeOff className={cn("h-4 w-4", !i.is_active && "text-brand-red")} />
                            </IconButton>
                            <IconButton label={`Delete ${i.name_en}`} danger onClick={() => { setDeleteError(""); setDeleting({ kind: "item", row: i }); }}><Trash2 className="h-4 w-4" /></IconButton>
                          </div>
                        )}
                        <div className="flex w-24 items-center justify-end gap-2">
                          {i.is_sold_out && <Badge tone="red">Sold out</Badge>}
                          <Toggle
                            on={i.is_sold_out}
                            busy={busyId === i.id}
                            label={`${i.name_en} sold out`}
                            onChange={(v) => act(i.id, () => supabase.rpc("set_menu_item_sold_out", { p_menu_item_id: i.id, p_sold_out: v }))}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>

          {/* ---------------------------------------------------------- add-on groups */}
          <Card className="p-0 xl:sticky xl:top-8">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-lg text-primary">Add-ons</h2>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => setEditing({ kind: "group" })}>
                  <Plus className="h-4 w-4" aria-hidden /> Group
                </Button>
              )}
            </div>
            {groups.length === 0 && <p className="px-5 py-4 text-sm text-muted-foreground">No add-on groups yet.</p>}
            {groups.map((g) => (
              <div key={g.id} className="border-b border-border px-5 py-3 last:border-0">
                <div className="mb-2 flex items-center gap-1">
                  <p className="flex-1 text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                    {g.name_en}
                    <span className="ms-2 normal-case tracking-normal">
                      {g.min_select > 0 ? "required" : "optional"} · {g.max_select === 1 ? "pick 1" : `up to ${g.max_select}`} · {groupUse[g.id] ?? 0} items
                    </span>
                  </p>
                  {isAdmin && (
                    <>
                      <IconButton label={`Add add-on to ${g.name_en}`} onClick={() => setEditing({ kind: "addon", group: g })}><Plus className="h-4 w-4" /></IconButton>
                      <IconButton label={`Edit ${g.name_en}`} onClick={() => setEditing({ kind: "group", group: g })}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label={`Delete ${g.name_en}`} danger onClick={() => { setDeleteError(""); setDeleting({ kind: "group", row: g }); }}><Trash2 className="h-4 w-4" /></IconButton>
                    </>
                  )}
                </div>
                {g.addons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No add-ons in this group.</p>
                ) : (
                  <ul className="space-y-1">
                    {g.addons.map((a) => (
                      <li key={a.id} className={cn("flex items-center gap-2", !a.is_active && "opacity-50")}>
                        <span className="flex-1 font-bold">
                          {a.name_en}
                          {a.is_default && <span className="ms-1 text-xs font-normal text-muted-foreground">(default)</span>}
                        </span>
                        <span className="text-sm text-muted-foreground tabular-nums">{a.price ? `+${egp(a.price)}` : "Free"}</span>
                        {isAdmin && (
                          <>
                            <IconButton label={`Edit ${a.name_en}`} onClick={() => setEditing({ kind: "addon", group: g, addon: a })}><Pencil className="h-3.5 w-3.5" /></IconButton>
                            <IconButton label={`Delete ${a.name_en}`} danger onClick={() => { setDeleteError(""); setDeleting({ kind: "addon", row: a }); }}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                          </>
                        )}
                        <Toggle
                          on={a.is_sold_out}
                          busy={busyId === a.id}
                          label={`${a.name_en} sold out`}
                          onChange={(v) => act(a.id, () => supabase.rpc("set_addon_sold_out", { p_addon_id: a.id, p_sold_out: v }))}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            <p className="px-5 py-3 text-xs text-muted-foreground">Red switch = sold out.</p>
          </Card>
        </div>
      )}

      {/* ---------------------------------------------------------- editors */}
      {editing?.kind === "category" && <CategoryEditor category={editing.category} nextSort={nextCategorySort} onClose={() => setEditing(null)} onSaved={saved} />}
      {editing?.kind === "item" && cats && (
        <ItemEditor item={editing.item} categories={cats} groups={groups} defaultCategoryId={editing.categoryId} onClose={() => setEditing(null)} onSaved={saved} />
      )}
      {editing?.kind === "group" && <GroupEditor group={editing.group} onClose={() => setEditing(null)} onSaved={saved} />}
      {editing?.kind === "addon" && <AddonEditor group={editing.group} addon={editing.addon} onClose={() => setEditing(null)} onSaved={saved} />}

      {deleting && (
        <ConfirmDelete
          title={`Delete ${deleting.kind === "group" ? "add-on group" : deleting.kind === "addon" ? "add-on" : deleting.kind}?`}
          busy={deleteBusy}
          error={deleteError}
          onClose={() => setDeleting(null)}
          onConfirm={confirmDelete}
          message={
            deleting.kind === "category" ? (
              deleting.row.menu_items.length ? (
                <p>
                  <b>{deleting.row.name_en}</b> still has {deleting.row.menu_items.length} items. Move them to another category or delete them first —
                  or just hide the category (Edit → untick “Show on the website”).
                </p>
              ) : (
                <p>Delete the empty category <b>{deleting.row.name_en}</b>? This can&apos;t be undone.</p>
              )
            ) : deleting.kind === "item" ? (
              <p>
                Delete <b>{deleting.row.name_en}</b> from the menu for good? Past orders keep their name and price. If you might sell it again, hide it instead (eye icon).
              </p>
            ) : deleting.kind === "group" ? (
              <p>
                Delete <b>{deleting.row.name_en}</b> and its {deleting.row.addons.length} add-ons? It will be removed from {groupUse[deleting.row.id] ?? 0} items. Past orders are not affected.
              </p>
            ) : (
              <p>Delete the add-on <b>{deleting.row.name_en}</b>? Past orders are not affected.</p>
            )
          }
        />
      )}
    </>
  );
}
