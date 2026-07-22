import { useState } from "react";
import {
  desktopSurfaceRegistry,
  type DesktopNavigationGroup,
} from "@constellation/desktop-preload/surface-registry";

export type NavigationGroup = DesktopNavigationGroup;
export const navigationGroups: readonly NavigationGroup[] = [
  ...new Set(desktopSurfaceRegistry.map((surface) => surface.group)),
];

interface NavigationGroupStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export const collapsedNavigationGroupsStorageKey =
  "constellation.navigation-groups";

export const parseCollapsedNavigationGroups = (
  value: unknown,
): readonly NavigationGroup[] => {
  if (!Array.isArray(value)) return [];
  return navigationGroups.filter((group) => value.includes(group));
};

const browserStorage = (): NavigationGroupStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const readCollapsedNavigationGroups = (
  storage: NavigationGroupStorage | undefined = browserStorage(),
): readonly NavigationGroup[] => {
  try {
    return parseCollapsedNavigationGroups(
      JSON.parse(storage?.getItem(collapsedNavigationGroupsStorageKey) ?? "[]"),
    );
  } catch {
    return [];
  }
};

export const persistCollapsedNavigationGroups = (
  groups: readonly NavigationGroup[],
  storage: NavigationGroupStorage | undefined = browserStorage(),
): void => {
  try {
    storage?.setItem(
      collapsedNavigationGroupsStorageKey,
      JSON.stringify(parseCollapsedNavigationGroups(groups)),
    );
  } catch {
    // A hardened renderer may deny storage. Disclosure still works for the
    // current mounted shell and safely returns expanded on the next session.
  }
};

export const useCollapsedNavigationGroups = (): readonly [
  readonly NavigationGroup[],
  (group: NavigationGroup) => void,
] => {
  const [collapsedGroups, setCollapsedGroups] = useState<
    readonly NavigationGroup[]
  >(readCollapsedNavigationGroups);

  const toggleGroup = (group: NavigationGroup) => {
    const next = collapsedGroups.includes(group)
      ? collapsedGroups.filter((candidate) => candidate !== group)
      : [...collapsedGroups, group];
    setCollapsedGroups(next);
    persistCollapsedNavigationGroups(next);
  };

  return [collapsedGroups, toggleGroup] as const;
};
