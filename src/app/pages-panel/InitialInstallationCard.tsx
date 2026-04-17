"use client";
import { useEffect, useRef, useState } from "react";
import type { XmcClient } from "@/services/sitecore/xmc";
import type { SiteScope } from "@/services/sitecore/site-scope";
import {
  provisionPluginSite
} from "@/lib/sitecore-provision";

export type InitialInstallationCardProps = {
  xmcClient: XmcClient | null;
  siteScope: SiteScope | null;
  onReady: () => void;
};

type Phase =
  | "idle"
  | "running"
  | "success"
  | "error";

type Step = { id: string; label: string };

// Visible phases that map onto what provisionPluginSite
// does client-side. The progress animation advances through
// these at a realistic cadence so the editor gets a
// meaningful activity indicator even though the provision
// helper runs them sequentially inside one call.
const STEPS: Step[] = [
  { id: "templates",
    label: "Creating plugin templates" },
  { id: "folders",
    label: "Preparing Settings and Data folders" },
  { id: "config",
    label: "Seeding configuration item" },
  { id: "bucket",
    label: "Initialising bug reports bucket" }
];

const STEP_MS = 800;

export function InitialInstallationCard(
  props: InitialInstallationCardProps
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>(
    []
  );

  useEffect(() => {
    return () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
  }, []);

  const startTicker = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
    setStepIndex(0);
    for (let i = 1; i < STEPS.length; i += 1) {
      timers.current.push(
        setTimeout(
          () => setStepIndex((prev) => Math.max(prev, i)),
          STEP_MS * i
        )
      );
    }
  };

  const run = async () => {
    if (!props.xmcClient || !props.siteScope) {
      setErr(
        "Sitecore SDK isn't ready yet. Wait a moment and " +
        "click Install again."
      );
      setPhase("error");
      return;
    }
    setPhase("running");
    setErr(null);
    startTicker();
    try {
      await provisionPluginSite({
        client: props.xmcClient,
        tenant: props.siteScope.tenant,
        site: props.siteScope.site
      });
      setStepIndex(STEPS.length - 1);
      timers.current.push(
        setTimeout(() => setPhase("success"), 350)
      );
      timers.current.push(
        setTimeout(() => props.onReady(), 750)
      );
    } catch (e) {
      setErr((e as Error).message);
      setPhase("error");
    }
  };

  const progressPct = phase === "success"
    ? 100
    : Math.round(
        ((stepIndex + 1) / STEPS.length) * 100
      );

  const canInstall =
    Boolean(props.xmcClient) && Boolean(props.siteScope);

  return (
    <div
      className="flex flex-col gap-3"
      aria-label="Initial installation"
    >
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary-200 bg-white/70 px-2.5 py-0.5 text-2xs font-semibold uppercase tracking-[0.18em] text-primary-700 backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
        Initial installation
      </span>
      <h2 className="text-base font-semibold tracking-tight text-gray-900">
        Install{" "}
        <span className="bg-gradient-to-r from-primary-600 via-pink-500 to-cyan-500 bg-clip-text text-transparent">
          Bug Reporter
        </span>{" "}
        on this site
      </h2>
      <p className="text-xs leading-relaxed text-gray-600">
        Creates the plugin&apos;s templates, site-level
        Settings and Data folders, configuration item, and
        bug reports bucket. Safe to click again if anything
        fails partway through.
      </p>

      {phase === "idle" && (
        <button
          onClick={run}
          disabled={!canInstall}
          className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-primary-600 via-pink-500 to-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_-15px_rgba(110,63,255,0.6)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="initial-install-btn"
        >
          {canInstall
            ? "Install on this site"
            : "Waiting for Sitecore…"}
        </button>
      )}

      {(phase === "running" || phase === "success") && (
        <div className="flex flex-col gap-2" role="status">
          <div
            className="relative h-2 overflow-hidden rounded-full bg-gradient-to-r from-primary-100 via-pink-100 to-cyan-100"
            aria-hidden
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary-600 via-pink-500 to-cyan-500 shadow-[0_0_16px_rgba(236,72,153,0.45)] transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div
            className="flex items-center justify-between text-2xs uppercase tracking-[0.18em] text-primary-700"
            aria-live="polite"
          >
            <span className="flex items-center gap-2 font-semibold">
              {phase === "success" ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-primary-500 to-cyan-500" />
                  Installed
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
                  {STEPS[stepIndex]?.label ?? "Installing"}
                </>
              )}
            </span>
            <span className="font-mono text-[10px] text-gray-500">
              {progressPct}%
            </span>
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {STEPS.map((step, i) => {
              const state: "done" | "active" | "pending" =
                phase === "success" || i < stepIndex
                  ? "done"
                  : i === stepIndex
                    ? "active"
                    : "pending";
              return (
                <li
                  key={step.id}
                  className="flex items-center gap-2 text-[11px]"
                >
                  <span
                    className={
                      state === "done"
                        ? "h-1.5 w-1.5 rounded-full bg-gradient-to-br from-primary-500 via-pink-400 to-cyan-500"
                        : state === "active"
                          ? "h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500"
                          : "h-1.5 w-1.5 rounded-full bg-gray-200"
                    }
                  />
                  <span
                    className={
                      state === "pending"
                        ? "text-gray-400"
                        : "text-gray-700"
                    }
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col gap-2 rounded-xl border border-pink-200 bg-gradient-to-br from-white via-pink-50 to-white p-3">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-pink-700">
            Installation failed
          </span>
          <p className="text-xs leading-relaxed text-gray-700">
            {err ?? "Something went wrong."}
          </p>
          <button
            onClick={run}
            disabled={!canInstall}
            className="inline-flex w-fit items-center justify-center rounded-xl border border-primary-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-primary-700 shadow-sm hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="initial-install-btn"
          >
            Retry installation
          </button>
        </div>
      )}
    </div>
  );
}
