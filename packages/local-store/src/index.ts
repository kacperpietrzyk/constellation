export interface LocalStoreDescriptor {
  readonly adapter: "encrypted-local-store";
  readonly availability: "not_integrated";
}

/**
 * M0 boundary marker. The production adapter replaces the preview adapter at
 * this package seam; no renderer code imports persistence directly.
 */
export const describeLocalStore = (): LocalStoreDescriptor => ({
  adapter: "encrypted-local-store",
  availability: "not_integrated",
});
