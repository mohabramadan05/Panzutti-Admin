"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Camera, ClipboardList, CreditCard, ExternalLink, LayoutDashboard, LogOut, Menu as MenuIcon, ShieldAlert, Users, UtensilsCrossed, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button, Spinner } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard, admin: false },
  { href: "/orders", label: "Orders", Icon: ClipboardList, admin: false },
  { href: "/payments", label: "InstaPay", Icon: CreditCard, admin: false },
  { href: "/menu", label: "Menu", Icon: UtensilsCrossed, admin: false },
  { href: "/family", label: "Family photos", Icon: Camera, admin: true },
  { href: "/applications", label: "Applications", Icon: Users, admin: true },
  { href: "/reports", label: "Reports", Icon: BarChart3, admin: false },
];

const WEBSITE = process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://panzutti.com";

/** Signed-in staff/admin only. Everything else gets the login page or a "no access" screen. */
export function Shell({ children }: { children: React.ReactNode }) {
  const { session, profile, isStaff, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  useEffect(() => setOpen(false), [pathname]);

  if (session === undefined || (session && profile === undefined) || session === null)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );

  if (!isStaff)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl bg-card p-8 text-center shadow ring-1 ring-border">
          <ShieldAlert className="mx-auto h-10 w-10 text-brand-red" aria-hidden />
          <h1 className="mt-3 text-2xl text-primary">No access yet</h1>
          <p className="mt-2 text-muted-foreground">
            You&apos;re signed in as <b>{session.user.email}</b>, but this account isn&apos;t marked as staff or admin.
            Ask the owner to run:
          </p>
          <code className="mt-3 block rounded-lg bg-muted p-3 text-left text-xs">
            update profiles set role = &apos;staff&apos; where email = &apos;{session.user.email}&apos;;
          </code>
          <Button variant="outline" className="mt-5" onClick={signOut}>
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </Button>
        </div>
      </div>
    );

  const links = NAV.filter((n) => !n.admin || isAdmin);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

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
