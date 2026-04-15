import { PagesPanel } from "../pages-panel/PagesPanel";

export default function FullScreen() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-lg font-semibold mb-4">
        JIRA Reporter (Full Screen)
      </h1>
      <PagesPanel />
    </div>
  );
}
