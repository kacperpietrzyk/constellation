import { useState } from "react";

export type SurfaceDensity = "comfortable" | "compact";
export type DensitySurface = "work";

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
    return parseSurfaceDensity(
      storage?.getItem(surfaceDensityStorageKey(surface)),
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
