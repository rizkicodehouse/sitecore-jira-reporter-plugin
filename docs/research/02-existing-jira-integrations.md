# Research: Existing JIRA Integrations for Sitecore & Reusable Libraries

Date: 2026-04-14

Scope: Prior art for a Sitecore XM Cloud Page Builder plugin that captures a
bug from the preview canvas and files a JIRA issue. Distribution target is
the Sitecore Marketplace. The preview pane is a **cross-origin iframe**,
which constrains screenshot options and is called out throughout.

## 1. Sitecore Marketplace listings (JIRA / bug-reporting)

The public Sitecore Marketplace catalogue is still in early-access rollout.
No JIRA or generic "bug reporter" plugin is listed as a public app at the
time of writing. Available reference apps so far target analytics, SEO,
field-pickers, and publishing status — not issue reporting.

- Sitecore Marketplace (landing): no JIRA/Atlassian listing found.
  [Sitecore Marketplace](https://www.sitecore.com/products/marketplace)
- Marketplace intro and app catalogue pattern (Google Analytics, Icon
  Picker, Autocropper, etc.).
  [Introducing Marketplace Custom Apps](https://developers.sitecore.com/learn/getting-started/marketplace)
- TAP ("ATL Sitecore Connector") is the only Atlassian-adjacent SKU in the
  partner marketplace, but it is content-sync between Atlassian-managed
  content sources and Sitecore — **not** an in-Pages bug reporter.
  [ATL Sitecore Connector](https://www.sitecore.com/products/marketplace/tap/xm/atl-sitecore-connector)
- Example of a real, published Pages Context Panel app (Xcentium
  Publishing Status). Closest structural analogue to what we want.
  [Building an XM Cloud Publishing Status Marketplace App](https://www.xcentium.com/blogs/building-a-sitecore-xm-cloud-publishing-status-marketplace-app)
  / repo: [XCentium/Sitecore-marketplace](https://github.com/XCentium/Sitecore-marketplace)
- Marketplace Early Access programme (still gating public listings).
  [Marketplace Early Access](https://www.sitecore.com/solutions/topics/content-management/marketplace-early-access)

Conclusion: there is **no direct competitor** on the Sitecore Marketplace.
We have first-mover positioning for a JIRA bug reporter plugin.

## 2. Atlassian Marketplace — reverse direction

Very thin. Atlassian Marketplace does not list a Sitecore XM Cloud
integration app. SitecoreAI has been shown integrating with Confluence in
POC form (community content only), not as a published Atlassian app.

- Atlassian Marketplace root — no Sitecore app visible on search.
  [Atlassian Marketplace](https://marketplace.atlassian.com/)
- Community POC for SitecoreAI + Confluence (blog only).
  [Practical SitecoreAI Extensions: PageSpeed, Mouseflow, Confluence](https://www.scadvent.com/2025/sitecoreai-pagespeed-mouseflow-and-confluence-integration/)

Implication: we only need to ship on the Sitecore side; JIRA integration
can be done via REST from our Marketplace app rather than a separate
Atlassian Connect/Forge app.

## 3. Community / OSS (GitHub)

Search across `sitecore jira`, `xmcloud jira`, `sitecore marketplace jira`,
`sitecore pages plugin bug` returned **no purpose-built JIRA reporter**
for Sitecore. The useful hits are scaffolding/starter repos we can lift
shape from.

Top 5 most relevant (ranked by reusability, not popularity):

| # | Repo | Relevance | Notes |
|---|---|---|---|
| 1 | [Sitecore/marketplace-starter](https://github.com/Sitecore/marketplace-starter) | Canonical scaffold — Next.js, TypeScript, demonstrates all 5 extension points including **Pages Context Panel**. Fork this. |
| 2 | [Sitecore/marketplace-sdk](https://github.com/Sitecore/marketplace-sdk) | Required SDK. `client` package provides secure postMessage bridge between the app iframe and XM Cloud host. Subscribe to page context. |
| 3 | [XCentium/Sitecore-marketplace](https://github.com/XCentium/Sitecore-marketplace) | Real-world Pages Context Panel app (publishing status). Shows SDK subscription pattern + server-side GraphQL to Authoring/Edge. Closest reference implementation. |
| 4 | [jflheureux/Sitecore-XM-Cloud-Extensions](https://github.com/jflheureux/Sitecore-XM-Cloud-Extensions) | Browser extension that patches the Pages UX. Not a Marketplace app, but useful for understanding Pages DOM and what cannot be done in-iframe. |
| 5 | [MartinMiles/awesome-sitecore](https://github.com/MartinMiles/awesome-sitecore) | Index check — confirms no existing JIRA/Atlassian/bug-reporter tool in the wider Sitecore ecosystem. |

No repo in this list solves the problem we are solving; there is nothing
to "directly fork" beyond the Sitecore starter.

## 4. Blog posts, tutorials, forum threads

- Sitecore official tutorial for the starter kit (full walkthrough).
  [From Zero to Deployed: Building with the Marketplace Starter Kit](https://developers.sitecore.com/learn/getting-started/marketplace/marketplace-starter-kit-nextjs-app-router)
- App registration / install lifecycle.
  [Configure and install a custom marketplace app](https://developers.sitecore.com/learn/getting-started/marketplace/marketplace-register-app)
- SUGCON Europe 2025 deep dive on extension points.
  [Konabos: Unlocking the Sitecore Marketplace](https://konabos.com/blog/unlocking-the-sitecore-marketplace-a-deep-dive-from-sugcon-europe-2025)
- MVP community intro.
  [Ravindra Mishra: Marketplace Apps Overview](https://ravindra-mishra.github.io/blogs/sitecore-marketplace-apps-overview-why-they-matter)
- Quick-start narrative with gotchas.
  [SitecoreSaga: Building Your First Marketplace App](https://sitecoresaga.blog/2025/08/15/building-your-first-sitecore-marketplace-app-a-developers-quick-start-guide/)

No Sitecore MVP blog, Codehouse post, or Slack Community thread discusses
JIRA integration inside Pages. This confirms the gap.

## 5. Generic "bug report from browser" libraries (reusable)

This is where the iframe constraint dominates. The Page Builder preview is
a cross-origin iframe, and **no client-side library can screenshot a
cross-origin iframe** without cooperation from inside that iframe
(browsers block it by design). Relevant evidence:

- `html2canvas` maintainer issue: cross-origin iframe capture is a no-go.
  [html2canvas #1532](https://github.com/niklasvh/html2canvas/issues/1532)
- `html-to-image` documents the same limitation.
  [html-to-image npm](https://www.npmjs.com/package/html-to-image)
- Monday.com engineering write-up on production tradeoffs.
  [Capturing DOM as Image Is Harder Than You Think](https://engineering.monday.com/capturing-dom-as-image-is-harder-than-you-think-how-we-solved-it-at-monday-com/)
- Ground-truth on browser security reasoning.
  [MDN: Screen Capture API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API)

### Candidate libraries

| Library | License | Maintenance | Size | Cross-origin iframe? | Notes |
|---|---|---|---|---|---|
| [html2canvas](https://github.com/niklasvh/html2canvas) | MIT | Stale, still dominant (~3M weekly dl) | ~48 KB gz | No (CORS blocked) | Only works on same-origin DOM; would capture our app chrome, not the preview. |
| [html-to-image](https://www.npmjs.com/package/html-to-image) | MIT | ~3M weekly dl, no release in 12 mo | ~18 KB gz | No | Same limitation. Better font/flexbox fidelity than html2canvas. |
| [modern-screenshot](https://github.com/qq15725/modern-screenshot) | MIT | Active (v4.6.8, 2 months ago) | ~20 KB gz | No | Fork of html-to-image, actively maintained, SVG-snapshot approach. Best same-origin pick if we capture our own panel. |
| [dom-to-image / dom-to-image-more](https://www.npmjs.com/package/dom-to-image-more) | MIT | Moderate | ~10 KB gz | No | Ancestor; not worth picking over modern-screenshot. |
| [@xataio/screenshot](https://github.com/xataio/screenshot) | Apache-2.0 | Active | Tiny | **Yes (via getDisplayMedia)** | Uses browser Screen Capture API. User picks the tab/window, so cross-origin limits are bypassed. One user-gesture prompt per capture. Most promising for our iframe constraint. |
| [Sentry User Feedback Widget](https://docs.sentry.io/product/user-feedback/) | BSL / open source SDK | Active | Part of `@sentry/browser` | Web screenshot button is **not supported on web** per docs; only on mobile SDKs. | Rule out for screenshot, but the widget UX and attachment envelope are a good reference. |
| [Marker.io Browser SDK](https://help.marker.io/en/articles/4621840-widget-javascript-sdk) | Proprietary, $59–199/mo | Active | Hosted widget | Uses cooperative techniques + native JIRA/GitHub sync | Not OSS; paid SaaS. Reference for UX only. |
| [BugHerd JS snippet](https://support.bugherd.com/en/articles/11424426-installing-bugherd-using-javascript) | Proprietary | Active | Hosted | Pin-on-element model, not full screenshot | Reference for in-page annotation UX. |
| [Jam.dev Recording Links](https://www.npmjs.com/package/@jam.dev/recording-links) | Proprietary | Active | Small | Capture script is same-origin constrained; cannot capture logs across origins without custom domain wiring | Good UX reference, unusable inside the cross-origin Pages iframe. |
| [SitePing](https://dev.to/neosianexus/i-built-a-self-hosted-alternative-to-markerio-heres-how-it-works-under-the-hood-2i7k) | OSS, self-hosted | New, single-author | ~23 KB gz | Targets own-site integration | Interesting annotation-anchoring design; probably not production-ready. |

### Key library finding

For our iframe constraint the serious options are:

1. **`@xataio/screenshot` (MIT/Apache)** using `getDisplayMedia` — user
   grants a one-time "share this tab" permission and we capture the full
   composite (our panel + the preview iframe), bypassing CORS entirely.
   This is the only route that yields a true screenshot of the live
   preview from inside a Marketplace app.
   [Xata screenshot repo](https://github.com/xataio/screenshot)
2. **`modern-screenshot`** as a secondary option for capturing the
   annotation/metadata panel that lives inside our own app origin.
   [qq15725/modern-screenshot](https://github.com/qq15725/modern-screenshot)

Everything else either won't work across origins or is proprietary SaaS.

### JIRA Cloud REST API (recap)

Issue creation and attachment endpoints under OAuth 2.0 (3LO) are well
documented. Attachments go via
`POST https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/issue/{key}/attachments`
with `X-Atlassian-Token: no-check` and `Authorization: Bearer`.

- [Jira Cloud REST v3 intro](https://developer.atlassian.com/cloud/jira/platform/rest/v3/intro/)
- [OAuth 2.0 (3LO) apps](https://developer.atlassian.com/cloud/jira/software/oauth-2-3lo-apps/)
- [Add attachment via REST API](https://support.atlassian.com/jira/kb/how-to-add-an-attachment-to-a-jira-issue-using-rest-api/)

## Summary of prior art

- **No existing JIRA reporter plugin for Sitecore** on either marketplace
  or on GitHub. First-mover.
- **Fork base**: `Sitecore/marketplace-starter` + `marketplace-sdk`.
  Reference implementation shape: `XCentium/Sitecore-marketplace`.
- **Screenshot strategy**: `@xataio/screenshot` (getDisplayMedia) is the
  only workable cross-origin path; `modern-screenshot` for same-origin
  panel capture. Skip html2canvas/html-to-image and all hosted SaaS.
- **JIRA API**: standard Cloud REST v3 + OAuth 2.0 (3LO); no exotic deps.
