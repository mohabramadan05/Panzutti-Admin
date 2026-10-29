"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Role } from "./types";

export type Profile = { id: string; full_name: string; email: string | null; role: Role; branch_id: string | null; is_active: boolean };

type AuthValue = {
  /** undefined while the stored session is being read */
  session: Session | null | undefined;
  /** undefined while loading; null when signed out or no profile row */
  profile: Profile | null | undefined;
  /** admin, staff or cashier: the order desk */
  isStaff: boolean;
  isAdmin: boolean;
  /** delivery driver: only the Deliveries page */
  isDriver: boolean;
  /** staff and admin (reports are refused to cashiers and drivers by the database) */
  canReports: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Role comes from public.profiles (set by the owner: update profiles set role='admin' …)
  useEffect(() => {
    if (session === undefined) return;
    if (!session) return setProfile(null);
    setProfile(undefined);
    supabase
      .from("profiles")
      .select("id, full_name, email, role, branch_id, is_active")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setProfile((data as Profile | null) ?? null));
  }, [session]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? error.message : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthValue>(() => {
    const role = profile?.is_active ? profile.role : undefined;
    return {
      session,
      profile,
      isStaff: role === "staff" || role === "admin" || role === "cashier",
      isAdmin: role === "admin",
      isDriver: role === "driver",
      canReports: role === "staff" || role === "admin",
      signIn,
      signOut,
    };
  }, [session, profile, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
