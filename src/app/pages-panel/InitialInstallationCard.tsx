"use client";
import { useState } from "react";

export type InitialInstallationCardProps = {
  scopedFetch: typeof fetch;
  onReady: () => void;
};

export function InitialInstallationCard(
  props: InitialInstallationCardProps
) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await props.scopedFetch(
        "/api/provision", { method: "POST" }
      );
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(
          typeof b.error === "string"
            ? b.error : `HTTP ${r.status}`
        );
      }
      props.onReady();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="initial-install-card">
      <h2>Bug Reporter for Jira — initial installation</h2>
      <p>
        Create the plugin&apos;s Settings and Data folders
        on this site. You can run this once; it&apos;s safe
        to click again if something fails partway through.
      </p>
      <button
        onClick={run}
        disabled={busy}
        data-testid="initial-install-btn"
      >
        {busy ? "Installing…" : "Install on this site"}
      </button>
      {err ? <p className="error">{err}</p> : null}
    </div>
  );
}
