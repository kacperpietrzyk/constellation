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
export type DensitySurface = "tasks";

/** Where a density stored by 0.1.x still sits. Read from, never written to; it
 *  is emptied of meaning by the first write under the new key. */
const retiredDensityKeys: Readonly<Record<DensitySurface, string>> = {
  tasks: "constellation.surface-density.work",
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
    const stored = storage?.getItem(surfaceDensityStorageKey(surface));
    // Absent under the current key is where a preference stored before the
    // surface was renamed lives. `null` and a stored "comfortable" are the same
    // answer here, so falling through on null costs nothing.
    return parseSurfaceDensity(
      stored ?? storage?.getItem(retiredDensityKeys[surface]),
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
