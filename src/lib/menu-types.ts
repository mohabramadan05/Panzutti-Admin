/** Menu rows as the admin Menu page loads them (columns from panzutti_supabase.sql). */

export type MenuItemRow = {
  id: string;
  category_id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  price: number; // piasters
  image_url: string | null;
  is_signature: boolean;
  is_sold_out: boolean;
  is_active: boolean;
  suggest_at_checkout: boolean;
  sort_order: number;
  menu_item_addon_groups: { group_id: string }[];
};

export type CategoryRow = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  sort_order: number;
  is_active: boolean;
  menu_items: MenuItemRow[];
};

export type AddonRow = {
  id: string;
  group_id: string;
  name_en: string;
  name_ar: string;
  price: number; // piasters
  max_quantity: number;
  is_default: boolean;
  is_sold_out: boolean;
  is_active: boolean;
  sort_order: number;
};

export type GroupRow = {
  id: string;
  name_en: string;
  name_ar: string;
  min_select: number;
  max_select: number;
  addons: AddonRow[];
};

/** "Golden Chicken Parm!" -> "golden-chicken-parm" (the website uses it in /menu/<slug>) */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** Friendlier text for the database errors admins can actually hit. */
export function friendlyDbError(message: string) {
  if (/duplicate key.*slug/i.test(message)) return "That web address (slug) is already used by another item or category. Pick a different one.";
  if (/violates foreign key constraint.*menu_items/i.test(message) || /menu_items_category_id_fkey/.test(message))
    return "This category still has items. Move or delete its items first.";
  if (/max_select >= min_select|check constraint/i.test(message)) return "“Max choices” must be at least 1 and not lower than “min choices”.";
  return message;
}
