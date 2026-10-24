"use client";
/* eslint-disable @next/next/no-img-element -- brand logo served by panzutti.com */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button, ErrorNote, Input } from "@/components/ui";

export default function LoginPage() {
  const { session, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err === "Invalid login credentials" ? "Wrong email or password." : err);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-green-dark p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-card p-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-center rounded-2xl bg-brand-red py-5">
          <img src="https://panzutti.com/brand/logo-cream.png" alt="Panzutti" className="h-12 w-auto" />
        </div>
        <h1 className="text-center text-2xl text-primary">Staff sign in</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Orders, payments, menu and reports.</p>

        <label className="mt-6 block">
          <span className="mb-1.5 block text-sm font-bold">Email</span>
          <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-sm font-bold">Password</span>
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
        <Button type="submit" busy={busy} className="mt-5 w-full">
          <LogIn className="h-4 w-4" aria-hidden /> Sign in
        </Button>
      </form>
    </div>
  );
}
