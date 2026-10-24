"use client";
/* eslint-disable @next/next/no-img-element -- short-lived signed URL from a private bucket */

import { useEffect, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PaymentProof } from "@/lib/types";
import { dateTime } from "@/lib/utils";
import { Badge, Button, ErrorNote, Input } from "./ui";

/**
 * One InstaPay screenshot with approve / reject. Approving marks the order paid
 * (review_payment_proof); rejecting needs a reason, which is emailed to the customer.
 */
export function ProofReview({ proof, amount, onDone }: { proof: PaymentProof; amount?: string; onDone: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const isPdf = proof.file_path.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    supabase.storage
      .from("payment-proofs")
      .createSignedUrl(proof.file_path, 60 * 10)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [proof.file_path]);

  const review = async (approve: boolean) => {
    if (!approve && !note.trim()) return setError("Write a reason — the customer will see it.");
    setBusy(approve ? "approve" : "reject");
    setError("");
    const { error: err } = await supabase.rpc("review_payment_proof", { p_proof_id: proof.id, p_approve: approve, p_note: note.trim() || null });
    setBusy(null);
    if (err) return setError(err.message);
    onDone();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={proof.status === "approved" ? "green" : proof.status === "rejected" ? "dark" : "yellow"}>{proof.status}</Badge>
        <span className="text-muted-foreground">Uploaded {dateTime(proof.created_at)}</span>
        {proof.reference && <span className="font-bold">Ref: {proof.reference}</span>}
        {amount && <span className="font-bold">Expected: {amount}</span>}
      </div>

      {url ? (
        isPdf ? (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-primary underline">
            Open PDF <ExternalLink className="h-4 w-4" aria-hidden />
          </a>
        ) : (
          <a href={url} target="_blank" rel="noreferrer" title="Open full size">
            <img src={url} alt="InstaPay transfer screenshot" className="max-h-80 w-auto rounded-xl bg-muted object-contain ring-1 ring-border" />
          </a>
        )
      ) : (
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      )}

      {proof.review_note && <p className="text-sm text-muted-foreground">Note: {proof.review_note}</p>}

      {proof.status === "pending" && (
        <div className="space-y-2">
          {rejecting && <Input autoFocus placeholder="Why is it rejected? (sent to the customer)" value={note} onChange={(e) => setNote(e.target.value)} />}
          <ErrorNote message={error} />
          <div className="flex flex-wrap gap-2">
            {!rejecting && (
              <Button onClick={() => review(true)} busy={busy === "approve"}>
                <Check className="h-4 w-4" aria-hidden /> Approve — mark paid
              </Button>
            )}
            {rejecting ? (
              <>
                <Button variant="danger" onClick={() => review(false)} busy={busy === "reject"}>
                  <X className="h-4 w-4" aria-hidden /> Reject
                </Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setRejecting(true)}>
                <X className="h-4 w-4" aria-hidden /> Reject…
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
