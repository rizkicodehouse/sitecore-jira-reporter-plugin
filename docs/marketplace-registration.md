# Sitecore Marketplace registration

## Extension points exposed

| Type | Route |
|---|---|
| Pages Context Panel | `/extensions/pages-panel` |
| Full Screen | `/extensions/full-screen` |

## Steps

1. Deploy to Vercel production. Note the URL (e.g.
   `https://jira-reporter.vercel.app`).
2. In Cloud Portal → Developer Studio → Register custom app:
   - App name: `JIRA Reporter`
   - Short description: "Report Page Builder bugs to JIRA."
   - Icon: upload `public/icon-256.png`
3. For each extension point, add a route:
   - Pages Context Panel →
     `https://jira-reporter.vercel.app/extensions/pages-panel`
   - Full Screen →
     `https://jira-reporter.vercel.app/extensions/full-screen`
4. Permissions (SDK v0.3):
   - `xmc.authoring.read` (datasource fields + user)
   - `pages.context.read`
   - `pages.layout.read`
   - `clipboard.write` (for "Copy issue link")
5. Save and install into your tenant.

## Validation

Run the manual smoke checklist after registration.
