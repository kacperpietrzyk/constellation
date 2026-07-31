import { useState } from "react";

export type SurfaceDensity = "comfortable" | "compact";
/**
 * Which surface a stored density belongs to.
 *
 * It was the single literal `"work"`, and that surface is gone. Widening the
 * union alone would have silently reset every stored choice — `getItem` answers
 * null, `parseSurfaceDensity(null)` answers "comfortable", nothing throws and
 * nothing is logged — so the read below falls back to the retired key once and
 * the next write carries the preference forward under the new one.
 */
export type DensitySurface = "tasks" | "pipeline" | "organizations";

/** Where a density stored by 0.1.x still sits. Read from, never written to; it
 *  is emptied of meaning by the first write under the new key.
 *
 *  `null` is the honest entry for a surface that has no predecessor: nothing
 *  was ever stored under any name for it. Pointing such a surface at an
 *  invented key, or at its own current one, would look like a migration and
 *  read nothing — which is the silent half of this trap wearing the costume of
 *  the fix. The loud half survives either way: the record is total over
 *  `DensitySurface`, so a new member without an entry fails to compile. */
const retiredDensityKeys: Readonly<Record<DensitySurface, string | null>> = {
  tasks: "constellation.surface-density.work",
  pipeline: null,
  organizations: null,
};

interface DensityStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export const surfaceDensityStorageKey = (surface: DensitySurface): string =>
  `constellation.surface-density.${surface}`;

export const parseSurfaceDensity = (value: unknown): SurfaceDensity =>
  value === "compact" ? "compact" : "comfortable";

const browserStorage = (): DensityStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const readSurfaceDensity = (
  surface: DensitySurface,
  storage: DensityStorage | undefined = browserStorage(),
): SurfaceDensity => {
  try {
    // Absent under the current key is where a preference stored before the
    // surface was renamed lives. `null` and a stored "comfortable" are the same
    // answer here, so falling through on null costs nothing. A surface with no
    // predecessor key falls through to nothing on purpose: it must not inherit
    // another surface's stored choice.
    const retired = retiredDensityKeys[surface];
    return parseSurfaceDensity(
      storage?.getItem(surfaceDensityStorageKey(surface)) ??
        (retired === null ? null : storage?.getItem(retired)),
    );
  } catch {
    return "comfortable";
  }
};

export const persistSurfaceDensity = (
  surface: DensitySurface,
  density: SurfaceDensity,
  storage: DensityStorage | undefined = browserStorage(),
): void => {
  try {
    storage?.setItem(surfaceDensityStorageKey(surface), density);
  } catch {
    // Storage may be unavailable in a hardened or private renderer. The local
    // preference still applies for the current mounted surface.
  }
};

export const useSurfaceDensity = (
  surface: DensitySurface,
): readonly [SurfaceDensity, (density: SurfaceDensity) => void] => {
  const [density, setDensityState] = useState<SurfaceDensity>(() =>
    readSurfaceDensity(surface),
  );
  const setDensity = (next: SurfaceDensity) => {
    setDensityState(next);
    persistSurfaceDensity(surface, next);
  };
  return [density, setDensity] as const;
};
