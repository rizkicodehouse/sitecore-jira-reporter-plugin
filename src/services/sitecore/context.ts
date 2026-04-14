export type PagesContext = {
  page: {
    id: string;
    path: string;
    title: string;
    language: string;
  };
  site: { name: string };
  rendering?: {
    instanceId: string;
    renderingId: string;
    name: string;
    templateName: string;
  } | null;
};

export type LayoutChangeEvent = {
  type: "page-layout" | "field-layout";
  renderingInstanceId?: string;
};

export interface MarketplaceSdkLike {
  query(name: string): Promise<{ data: unknown }>;
  subscribe(
    topic: string, handler: (evt: unknown) => void
  ): () => void;
}

let sdkRef: MarketplaceSdkLike | null = null;

export function initSitecoreContext(
  sdk: MarketplaceSdkLike
): void {
  sdkRef = sdk;
}

export async function getPagesContext(): Promise<PagesContext> {
  if (!sdkRef) throw new Error("sdk-not-initialised");
  const res = await sdkRef.query("pages.context");
  return res.data as PagesContext;
}

export function subscribeToLayoutChanges(
  cb: (evt: LayoutChangeEvent) => void
): () => void {
  if (!sdkRef) throw new Error("sdk-not-initialised");
  return sdkRef.subscribe("pages.layout", (e) =>
    cb(e as LayoutChangeEvent)
  );
}

export function getSelectedRendering(
  ctx: PagesContext
): PagesContext["rendering"] {
  return ctx.rendering ?? null;
}
