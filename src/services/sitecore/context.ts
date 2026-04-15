export type RenderingInfo = {
  id: string;
  instanceId: string;
  placeholderKey?: string;
  dataSource?: string;
  parameters?: Record<string, string>;
};

export type PagesContext = {
  pageInfo?: {
    id: string;
    name?: string;
    displayName?: string;
    path?: string;
    url?: string;
    language?: string;
    presentationDetails?: string;
    template?: { name?: string; id?: string };
  };
  siteInfo?: {
    id?: string;
    name?: string;
    displayName?: string;
    language?: string;
  };
};

export type LayoutChangeEvent = {
  type: "page-layout" | "field-layout";
  renderingInstanceId?: string;
  itemId?: string;
};

export type FieldsUpdatedEvent = {
  itemId?: string;
  language?: string;
  itemVersion?: number;
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

export type HostUser = {
  email?: string;
  name?: string;
  displayName?: string;
  accountId?: string;
};

export async function getHostUser(): Promise<HostUser | null> {
  if (!sdkRef) return null;
  try {
    const res = await sdkRef.query("host.user");
    return (res?.data ?? null) as HostUser | null;
  } catch {
    return null;
  }
}

export function subscribeToLayoutChanges(
  cb: (evt: LayoutChangeEvent) => void
): () => void {
  if (!sdkRef) throw new Error("sdk-not-initialised");
  return sdkRef.subscribe(
    "pages.content.layoutUpdated",
    (e) => cb(e as LayoutChangeEvent)
  );
}

export function subscribeToFieldUpdates(
  cb: (evt: FieldsUpdatedEvent) => void
): () => void {
  if (!sdkRef) throw new Error("sdk-not-initialised");
  return sdkRef.subscribe(
    "pages.content.fieldsUpdated",
    (e) => cb(e as FieldsUpdatedEvent)
  );
}

export function parseRenderings(
  presentationDetails?: string
): RenderingInfo[] {
  if (!presentationDetails) return [];
  try {
    const parsed = JSON.parse(presentationDetails) as {
      devices?: Array<{
        renderings?: RenderingInfo[];
      }>;
    };
    const devices = parsed.devices ?? [];
    return devices.flatMap((d) => d.renderings ?? []);
  } catch {
    return [];
  }
}
