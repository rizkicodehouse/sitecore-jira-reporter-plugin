// Extracts the tenant + site folder names that the plugin
// uses as the root for Settings/Bug Reports items. Sitecore
// content paths follow `/sitecore/content/<tenant>/<site>/...`
// so the first two segments under `/sitecore/content/` are
// the scope the plugin needs.
//
// The Marketplace SDK exposes `pageInfo.path` on the pages
// context, which is the most reliable source. When no page
// is selected (fullscreen surface), the caller must derive
// scope from another input — this helper is pages-only.

export type SiteScope = { tenant: string; site: string };

export function parseSiteScopeFromPath(
  path: string | undefined
): SiteScope | null {
  if (!path) return null;
  const m = path.match(
    /^\/sitecore\/content\/([^/]+)\/([^/]+)(?:\/|$)/i
  );
  if (!m || !m[1] || !m[2]) return null;
  return { tenant: m[1], site: m[2] };
}
