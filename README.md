# Panzutti Admin

Staff and admin panel for Panzutti. It is a separate Next.js app that talks to the **same Supabase project** as the customer website (`D:\work\Panzutti`). Read that repo's `CLAUDE.md` and `database/PANZUTTI_DATABASE.md` before changing anything here.

## Run it

```bash
npm install
npm run dev      # http://localhost:3001  (the website runs on 3000)
npm run build    # must pass before you finish any task
```

`.env.local` (public values only, git-ignored):

```
NEXT_PUBLIC_SUPABASE_URL=https://dpwsssmwarxntplorgtl.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3001
NEXT_PUBLIC_WEBSITE_URL=http://localhost:3000
```

Never put the service-role key in this app. Everything goes through the staff's own login, Row Level Security and the staff/admin RPCs, so the database decides what each role may do.

## Giving someone access

1. **Supabase → Authentication → Users → Add user → Create new user.** Enter the email and a password, and tick **Auto Confirm User**.
2. **Supabase → SQL Editor**, then set the role:
   ```sql
   -- an admin (sees every branch, family photos, applications, can edit prices)
   update profiles set role = 'admin' where email = 'name@example.com';

   -- staff (one branch: orders, InstaPay, sold-out switches, reports)
   update profiles set role = 'staff',
     branch_id = (select id from branches where slug = 'meraki-salah-salem')
   where email = 'name@example.com';
   ```
   **Staff must have a `branch_id`.** Without one they see no orders.
3. Sign in at `/login`. Someone signed in without one of these roles sees a "No access yet" screen.

To remove access, run `update profiles set role = 'customer'` or `is_active = false`.

## Pages

| Page | Who | What |
|---|---|---|
| `/` Dashboard | staff, admin | Today's sales (`report_daily_sales`), live order counts, things waiting |
| `/orders` | staff, admin | Live board (Realtime on `orders`), detail panel, next status / cancel with reason / mark paid (`update_order_status`, `mark_order_paid`), sound alert and tab-title count for new orders |
| `/payments` | staff, admin | InstaPay screenshots: approve or reject with a reason (`review_payment_proof`) |
| `/menu` | staff, admin | Sold-out switches (`set_menu_item_sold_out`, `set_addon_sold_out`). **Admins:** add / edit / delete categories, items (with photo upload to the public `menu-images` bucket and which add-on groups they offer), add-on groups (min/max choices) and add-ons; hide items |
| `/family` | admin | Approve, reject or remove Panzutti Family photos (`review_family_photo`), guest uploads included |
| `/applications` | admin | Job and supplier applications: status, internal note, CV download (signed URL) |
| `/reports` | staff, admin | `report_branch_summary`, daily sales, top items, payment methods, categories, busy hours, CSV export |

## Code map

```
src/
├─ app/
│  ├─ login/page.tsx
│  └─ (panel)/            ← everything behind the login (layout = Shell)
│     ├─ page.tsx          dashboard
│     ├─ orders/  payments/  menu/  family/  applications/  reports/
├─ components/
│  ├─ shell.tsx           sidebar, sign-in guard, "no access" screen
│  ├─ order-detail.tsx    order slide-over + actions
│  ├─ proof-review.tsx    InstaPay screenshot approve/reject (orders + payments)
│  ├─ admin-only.tsx      hides admin pages from staff
│  ├─ menu-editors.tsx    Category / Item / Add-on group / Add-on forms
│  ├─ modal.tsx           Modal, ConfirmDelete, Field, Check
│  └─ ui.tsx              Button, Card, Badge, StatusBadge, Input, …
└─ lib/
   ├─ supabase.ts         single browser client (session kept in localStorage)
   ├─ auth.tsx            AuthProvider: session + profile (role, branch)
   ├─ use-orders.ts       orders + Realtime subscription
   ├─ types.ts            row types, status labels, allowed next status
   └─ utils.ts            cn(), egp() (piasters), Cairo date/time helpers
```

## Notes

- **Money:** all money is integer piasters, displayed with `egp()`.
- **Status rules:** the allowed next status in `types.ts` mirrors `update_order_status()`. An InstaPay order can't be completed until it is paid.
- **Live updates:** the orders board subscribes to Realtime and also reloads every 60 s as a safety net.
- **Language:** the panel is English only.
- **Deleting:** deleting a menu item or add-on never breaks old orders. They keep their own copy of the name and price, and the database sets the link to NULL. A category can only be deleted when it is empty (`ON DELETE RESTRICT`). Deleting an add-on group also deletes its add-ons and its links to items.
- **Photos:** uploaded photos are stored as `menu-images/items/<slug>-<timestamp>.<ext>`. When an item is deleted, its uploaded photo is removed too. Cloudinary links are left alone.
- **Not built yet:** promo code management, branch hours and fee editing, job positions, staff accounts management, drag-and-drop ordering. These are admin table edits in Supabase for now.
