"use client";
import { useEffect } from "react";

export default function AuthComplete() {
  useEffect(() => {
    try {
      window.close();
    } catch {
      /* script-opened tabs can self-close; user-opened ones cannot */
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-primary-100 bg-white/90 p-6 text-center shadow-[0_20px_50px_-25px_rgba(110,63,255,0.35)] backdrop-blur">
        <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-gradient-to-br from-primary-500 via-pink-500 to-cyan-500" />
        <h1 className="text-lg font-semibold text-gray-900">
          Sign-in complete
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          You can close this tab and return to Sitecore
          Pages. The Bug Reporter panel will refresh
          automatically.
        </p>
      </div>
    </div>
  );
}
