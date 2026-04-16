import { ReportsView } from "@/features/reports/ReportsView";

export default function FullScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#f7f6ff] via-white to-[#fff4fe]" />
        <div className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-primary-200/40 blur-3xl" />
        <div className="absolute top-32 -right-24 h-[26rem] w-[26rem] rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-[22rem] w-[22rem] rounded-full bg-pink-200/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl p-6 lg:p-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/70 px-3 py-1 text-2xs font-semibold uppercase tracking-[0.18em] text-primary-700 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
              Bug log
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
              Reported{" "}
              <span className="bg-gradient-to-r from-primary-600 via-pink-500 to-cyan-500 bg-clip-text text-transparent">
                Bugs
              </span>
            </h1>
            <p className="mt-1 max-w-xl text-sm text-gray-500">
              Every bug submitted via Bug Reporter for Jira
              for this tenant, newest first.
            </p>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-primary-100 bg-white/80 shadow-[0_30px_80px_-30px_rgba(110,63,255,0.35)] backdrop-blur-md">
          <div className="h-1 bg-gradient-to-r from-primary-500 via-pink-500 to-cyan-500" />
          <div className="p-5 lg:p-6">
            <ReportsView />
          </div>
        </section>
      </div>
    </div>
  );
}
