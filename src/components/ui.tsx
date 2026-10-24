import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, type OrderStatus } from "@/lib/types";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl text-primary md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border", className)} {...props} />;
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "danger" | "outline" | "ghost" | "yellow";
  size?: "sm" | "md";
  busy?: boolean;
};

export function Button({ variant = "primary", size = "md", busy, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-5 py-2.5",
        variant === "primary" && "bg-primary text-primary-foreground hover:brightness-110",
        variant === "danger" && "bg-brand-red text-brand-cream hover:brightness-110",
        variant === "yellow" && "bg-brand-yellow text-foreground hover:brightness-105",
        variant === "outline" && "bg-card text-primary ring-1 ring-border hover:ring-primary",
        variant === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Badge({ tone = "muted", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "muted" | "green" | "red" | "yellow" | "dark" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "green" && "bg-primary/10 text-primary",
        tone === "red" && "bg-brand-red/10 text-brand-red",
        tone === "yellow" && "bg-brand-yellow/60 text-foreground",
        tone === "dark" && "bg-foreground text-background",
        className,
      )}
      {...props}
    />
  );
}

const STATUS_TONE: Record<OrderStatus, "muted" | "green" | "red" | "yellow" | "dark"> = {
  pending: "red",
  confirmed: "yellow",
  preparing: "yellow",
  ready: "green",
  out_for_delivery: "green",
  completed: "muted",
  cancelled: "dark",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-6 w-6 animate-spin text-primary", className)} aria-label="Loading" />;
}

export function Empty({ title, hint, icon }: { title: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-border px-6 py-12 text-center">
      {icon && <div className="mb-3 text-primary/50">{icon}</div>}
      <p className="font-display text-xl text-primary">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">
      {message}
    </p>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("h-11 w-full rounded-xl bg-background px-3.5 ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary", className)}
      {...props}
    />
  );
}
