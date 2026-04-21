export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
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
              Report issues
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900">
              Report issues in Jira
            </h1>
            <p className="mt-1 max-w-xl text-sm text-gray-500">
              Quickly report problems you find while editing content so your
              team can reproduce and fix them faster.
            </p>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-primary-100 bg-white/80 shadow-[0_30px_80px_-30px_rgba(110,63,255,0.35)] backdrop-blur-md p-6">
          <div className="h-1 mb-4 bg-gradient-to-r from-primary-500 via-pink-500 to-cyan-500 rounded" />

          <h2 className="text-lg font-medium">How to use</h2>
          <ol className="list-decimal pl-6 mt-3 text-sm space-y-1">
            <li>Open the Sitecore Pages editor where this plugin is embedded.</li>
            <li>Open the reporter (plugin) and choose "Report bug".</li>
            <li>Select the affected component or pick "Page-level" for whole-page issues.</li>
            <li>Write a clear summary and steps to reproduce. Attach an image using "Upload image" if helpful.</li>
            <li>Submit the report — a Jira issue will be created and linked to the current page.</li>
          </ol>

          <h3 className="mt-6 text-sm font-medium">Where this plugin appears</h3>
          <ul className="list-disc pl-6 text-sm mt-2">
            <li><a href="/pages-panel" className="text-primary-600 underline">/pages-panel</a> — Pages Context Panel (used inside the Pages editor)</li>
            <li><a href="/full-screen" className="text-primary-600 underline">/full-screen</a> — Full-screen plugin interface</li>
          </ul>

          <p className="mt-6 text-sm text-gray-600">
            Please avoid including passwords or sensitive personal data in
            screenshots or descriptions.
          </p>
        </section>
      </div>
    </div>
  );
}
