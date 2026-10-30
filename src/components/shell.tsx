"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Bike, Camera, ClipboardList, Contact, CreditCard, ExternalLink, LayoutDashboard, LogOut, Menu as MenuIcon, ShieldAlert, Star, UserCog, Users, UtensilsCrossed, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, Spinner } from "./ui";

type PanelRole = Exclude<Role, "customer">;

/** Who sees which page (the database enforces the same rules, this only hides what they can't use) */
const NAV: { href: string; label: string; Icon: typeof LayoutDashboard; roles: PanelRole[] }[] = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard, roles: ["admin", "staff"] },
  { href: "/orders", label: "Orders", Icon: ClipboardList, roles: ["admin", "staff", "cashier"] },
  { href: "/deliveries", label: "Deliveries", Icon: Bike, roles: ["driver"] },
  { href: "/payments", label: "InstaPay", Icon: CreditCard, roles: ["admin", "staff", "cashier"] },
  { href: "/menu", label: "Menu", Icon: UtensilsCrossed, roles: ["admin", "staff", "cashier"] },
  { href: "/customers", label: "Customers", Icon: Contact, roles: ["admin", "staff", "cashier"] },
  { href: "/loyalty", label: "Loyalty points", Icon: Star, roles: ["admin", "staff", "cashier"] },
  { href: "/family", label: "Family photos", Icon: Camera, roles: ["admin"] },
  { href: "/applications", label: "Applications", Icon: Users, roles: ["admin"] },
  { href: "/reports", label: "Reports", Icon: BarChart3, roles: ["admin", "staff"] },
  { href: "/users", label: "Users & roles", Icon: UserCog, roles: ["admin"] },
];

const isUnder = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

const WEBSITE = process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://panzutti.com";

/** Signed-in staff/admin only. Everything else gets the login page or a "no access" screen. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { session, profile, isStaff, isDriver, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const role = (isStaff || isDriver) && profile ? (profile.role as PanelRole) : null;
  const links = useMemo(() => (role ? NAV.filter((n) => n.roles.includes(role)) : []), [role]);
  const allowed = links.some((n) => isUnder(pathname, n.href));
  const home = links[0]?.href;

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  // A page this role can't use (e.g. a driver opening "/"): go to their first page
  useEffect(() => {
    if (!allowed && home) router.replace(home);
  }, [allowed, home, router]);

  useEffect(() => setOpen(false), [pathname]);

  if (session === undefined || (session && profile === undefined) || session === null)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );

  if (!role)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-card p-8 text-center shadow ring-1 ring-border">
          <ShieldAlert className="mx-auto h-10 w-10 text-brand-red" aria-hidden />
          <h1 className="mt-3 text-2xl text-primary">No access yet</h1>
          <p className="mt-2 text-muted-foreground">
            You&apos;re signed in as <b>{session.user.email}</b>, but this account has no staff role yet (or it was switched off).
            Ask an admin to give you one under <b>Users &amp; roles</b>.
          </p>
          <Button variant="outline" className="mt-5" onClick={signOut}>
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </Button>
        </div>
      </div>
    );

  if (!allowed)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );

  const isActive = (href: string) => isUnder(pathname, href);

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {links.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold transition",
            isActive(href) ? "bg-brand-cream text-brand-green-dark" : "text-brand-cream/80 hover:bg-brand-cream/10 hover:text-brand-cream",
          )}
        >
          <Icon className="h-5 w-5" aria-hidden /> {label}
        </Link>
      ))}
    </nav>
  );

  const footer = (
    <div className="mt-auto space-y-3 border-t border-brand-cream/15 pt-4 text-sm text-brand-cream/80">
      <a href={WEBSITE} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-brand-cream">
        <ExternalLink className="h-4 w-4" aria-hidden /> Open website
      </a>
      <div>
        <p className="truncate font-bold text-brand-cream">{profile?.full_name || session.user.email}</p>
        <p className="text-xs uppercase tracking-wider text-brand-yellow">{profile?.role}</p>
      </div>
      <button type="button" onClick={signOut} className="flex items-center gap-2 font-bold hover:text-brand-cream">
        <LogOut className="h-4 w-4" aria-hidden /> Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col bg-brand-green-dark p-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2 pt-2">
          <span aria-label="Panzutti" className="font-display text-2xl font-extrabold italic leading-none text-brand-cream">Panzutti</span>
          <span className="rounded-full bg-brand-yellow px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-foreground">Admin</span>
        </Link>
        {nav}
        {footer}
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-brand-green-dark px-4 py-3 lg:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span aria-label="Panzutti" className="font-display text-xl font-extrabold italic leading-none text-brand-cream">Panzutti</span>
          <span className="rounded-full bg-brand-yellow px-2 py-0.5 text-[10px] font-extrabold uppercase text-foreground">Admin</span>
        </Link>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Menu" className="rounded-lg p-2 text-brand-cream">
          {open ? <X className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-x-0 bottom-0 top-14 z-30 flex flex-col overflow-y-auto bg-brand-green-dark p-4 lg:hidden">
          {nav}
          {footer}
        </div>
      )}

      <main className="min-w-0 p-4 md:p-8">{children}</main>
    </div>
  );
}
