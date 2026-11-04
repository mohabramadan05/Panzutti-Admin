"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Truck } from "lucide-react";
import { AdminOnly } from "@/components/admin-only";
import { Badge, Button, Card, Empty, ErrorNote, Input, PageHeader, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { egp } from "@/lib/utils";
import { refreshWebsite } from "@/lib/website";

type Branch = {
  id: string;
  name_en: string;
  delivery_fee: number;
  min_delivery_order: number;
  is_active: boolean;
  // v8 SQL (panzutti_supabase_v8.sql): absent until it is run
  latitude?: number | null;
  longitude?: number | null;
  delivery_per_km?: number;
  delivery_included_km?: number;
  delivery_max_km?: number | null;
};

/** EGP text from the form → piasters. Empty or invalid = null, so a blank box can't turn into free delivery. */
const toPiasters = (value: string) => {
  const n = Number(value);
  return value.trim() === "" || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100);
};

/** "30.0866, 31.327" as copied from Google Maps (right-click on the map). */
const parseLocation = (value: string) => {
  const m = value.trim().match(/^(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const [lat, lng] = [Number(m[1]), Number(m[2])];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

function BranchPrices({ branch }: { branch: Branch }) {
  const hasDistanceColumns = "latitude" in branch;
  const [fee, setFee] = useState(String(branch.delivery_fee / 100));
  const [minimum, setMinimum] = useState(String(branch.min_delivery_order / 100));
  const [location, setLocation] = useState(branch.latitude != null ? `${branch.latitude}, ${branch.longitude}` : "");
  const [perKm, setPerKm] = useState(String((branch.delivery_per_km ?? 0) / 100));
  const [includedKm, setIncludedKm] = useState(String(branch.delivery_included_km ?? 0));
  const [maxKm, setMaxKm] = useState(branch.delivery_max_km != null ? String(branch.delivery_max_km) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const point = parseLocation(location);
  const base = toPiasters(fee) ?? 0;
  const rate = toPiasters(perKm) ?? 0;
  const included = Math.max(Number(includedKm) || 0, 0);
  const feeAt = (km: number) => base + Math.ceil(Math.max(km - included, 0)) * rate;

  const save = async () => {
    const delivery_fee = toPiasters(fee);
    const min_delivery_order = toPiasters(minimum);
    if (delivery_fee === null) return setError("Enter the delivery fee in EGP (0 = free delivery)");
    if (min_delivery_order === null) return setError("Enter the minimum order in EGP (0 = no minimum)");

    let distance = {};
    if (hasDistanceColumns) {
      const delivery_per_km = toPiasters(perKm);
      const delivery_max_km = maxKm.trim() === "" ? null : Number(maxKm);
      if (location.trim() && !point) return setError("Enter the location as latitude, longitude, for example 30.0866, 31.327");
      if (delivery_per_km === null) return setError("Enter the price per km in EGP (0 = same fee for any distance)");
      if (includedKm.trim() === "" || !(Number(includedKm) >= 0)) return setError("Enter the km included in the base fee (0 = none)");
      if (delivery_max_km !== null && !(delivery_max_km > 0)) return setError("Enter the longest delivery distance in km, or leave it empty for no limit");
      distance = { latitude: point?.lat ?? null, longitude: point?.lng ?? null, delivery_per_km, delivery_included_km: Number(includedKm), delivery_max_km };
    }

    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.from("branches").update({ delivery_fee, min_delivery_order, ...distance }).eq("id", branch.id).select("id");
    setBusy(false);
    if (err) return setError(err.message);
    if (!data?.length) return setError("Not saved: only admins can change delivery prices");
    refreshWebsite();
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl text-primary">{branch.name_en}</h2>
        {!branch.is_active && <Badge>Inactive</Badge>}
        {point && <Badge tone="green">Priced by distance</Badge>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold">
          {point ? "Base fee (EGP)" : "Delivery fee (EGP)"}
          <Input type="number" min={0} step="0.5" value={fee} onChange={(e) => setFee(e.target.value)} className="mt-1" />
        </label>
        <label className="block text-sm font-bold">
          Minimum order for delivery (EGP)
          <Input type="number" min={0} step="1" value={minimum} onChange={(e) => setMinimum(e.target.value)} className="mt-1" />
        </label>
      </div>

      {hasDistanceColumns ? (
        <>
          <div>
            <label className="block text-sm font-bold">
              Restaurant location (latitude, longitude)
              <Input dir="ltr" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="30.0866, 31.327" className="mt-1" />
            </label>
            <p className="mt-1 text-sm text-muted-foreground">In Google Maps, right-click the restaurant and click the numbers to copy them. Leave empty to charge one fixed fee.</p>
            {point && (
              <a href={`https://www.google.com/maps?q=${point.lat},${point.lng}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-primary underline underline-offset-2">
                Check this location on the map <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            )}
          </div>
          {point && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-bold">
                  Price per km (EGP)
                  <Input type="number" min={0} step="0.5" value={perKm} onChange={(e) => setPerKm(e.target.value)} className="mt-1" />
                </label>
                <label className="block text-sm font-bold">
                  Km included in base fee
                  <Input type="number" min={0} step="0.5" value={includedKm} onChange={(e) => setIncludedKm(e.target.value)} className="mt-1" />
                </label>
                <label className="block text-sm font-bold">
                  Longest distance (km)
                  <Input type="number" min={0} step="0.5" value={maxKm} onChange={(e) => setMaxKm(e.target.value)} placeholder="No limit" className="mt-1" />
                </label>
              </div>
              <p className="text-sm text-muted-foreground">
                Distance is measured in a straight line to the customer&apos;s map pin, and each started km counts as a full km. Customers must pin their location to order delivery.
              </p>
              <p className="text-sm text-muted-foreground">
                Examples: 2 km = <b>{egp(feeAt(2))}</b>, 5 km = <b>{egp(feeAt(5))}</b>, 10 km = <b>{egp(feeAt(10))}</b>.
              </p>
            </>
          )}
        </>
      ) : (
        <p className="rounded-xl bg-muted p-3 text-sm">To price delivery by distance, first run <b>database/panzutti_supabase_v8.sql</b> in Supabase.</p>
      )}

      {!point && (
        <p className="text-sm text-muted-foreground">
          Customers pay <b>{egp(base)}</b> for delivery
          {toPiasters(minimum) ? <> on orders of at least <b>{egp(toPiasters(minimum) ?? 0)}</b></> : null}.
        </p>
      )}
      <ErrorNote message={error} />
      <div className="flex items-center gap-3">
        <Button onClick={save} busy={busy}>Save</Button>
        {saved && <span className="text-sm font-bold text-primary">Saved</span>}
      </div>
    </Card>
  );
}

export default function DeliveryPage() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase
      .from("branches")
      .select("*") // not a column list: the page has to load before the v8 columns exist
      .order("created_at")
      .then(({ data, error: err }) => {
        if (err) return setError(err.message);
        setBranches((data as Branch[]) ?? []);
      });
  }, []);

  return (
    <>
      <PageHeader title="Delivery prices" subtitle="New prices apply to new orders right away. Orders already placed keep the fee they were placed with." />
      <AdminOnly>
        <ErrorNote message={error} />
        {!branches ? (
          !error && <Spinner />
        ) : !branches.length ? (
          <Empty title="No branches yet" icon={<Truck className="h-8 w-8" />} />
        ) : (
          <div className="max-w-2xl space-y-4">
            {branches.map((b) => (
              <BranchPrices key={b.id} branch={b} />
            ))}
          </div>
        )}
      </AdminOnly>
    </>
  );
}
