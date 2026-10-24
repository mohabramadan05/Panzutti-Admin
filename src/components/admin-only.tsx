"use client";

import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Empty } from "./ui";

/** The database refuses these actions for staff anyway; this just explains it instead of showing errors. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Empty title="Admins only" hint="Ask an admin if you need access to this page." icon={<ShieldAlert className="h-8 w-8" />} />;
  return <>{children}</>;
}
