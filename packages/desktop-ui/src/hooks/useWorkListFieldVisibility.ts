import { useMemo, useState } from "react";

export const workListCoreFieldKeys = [
  "context",
  "status",
  "assignee",
  "priority",
  "start",
  "due",
] as const;

export type WorkListCoreFieldKey = (typeof workListCoreFieldKeys)[number];
export type WorkListFieldKey = WorkListCoreFieldKey | `field:${string}`;

export const recommendedWorkListFieldKeys: readonly WorkListFieldKey[] = [
  "context",
  "priority",
  "due",
];

interface FieldVisibilityStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

const browserStorage = (): FieldVisibilityStorage | undefined => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export const workListFieldVisibilityStorageKey = (viewKey: string): string =>
  `constellation.work-list-fields.${viewKey}`;

const recommendedFor = (
  availableKeys: readonly WorkListFieldKey[],
): readonly WorkListFieldKey[] =>
  recommendedWorkListFieldKeys.filter((key) => availableKeys.includes(key));

export const parseWorkListFieldVisibility = (
  value: unknown,
  availableKeys: readonly WorkListFieldKey[],
): readonly WorkListFieldKey[] => {
  const fallback = recommendedFor(availableKeys);
  if (!Array.isArray(value) || value.length > 32) return fallback;
  if (
    value.some(
      (key) =>
        typeof key !== "string" ||
        !availableKeys.includes(key as WorkListFieldKey),
    )
  )
    return fallback;
  if (new Set(value).size !== value.length) return fallback;
  const selected = new Set(value as readonly WorkListFieldKey[]);
  return availableKeys.filter((key) => selected.has(key));
};

export const readWorkListFieldVisibility = (
  viewKey: string,
  availableKeys: readonly WorkListFieldKey[],
  storage: FieldVisibilityStorage | undefined = browserStorage(),
): readonly WorkListFieldKey[] => {
  try {
    return parseWorkListFieldVisibility(
      JSON.parse(
        storage?.getItem(workListFieldVisibilityStorageKey(viewKey)) ?? "null",
      ),
      availableKeys,
    );
  } catch {
    return recommendedFor(availableKeys);
  }
};

export const persistWorkListFieldVisibility = (
  viewKey: string,
  selectedKeys: readonly WorkListFieldKey[],
  availableKeys: readonly WorkListFieldKey[],
  storage: FieldVisibilityStorage | undefined = browserStorage(),
): void => {
  try {
    storage?.setItem(
      workListFieldVisibilityStorageKey(viewKey),
      JSON.stringify(parseWorkListFieldVisibility(selectedKeys, availableKeys)),
    );
  } catch {
    // A denied local preference write must not block the mounted list. The
    // in-memory override below remains active until this shell closes.
  }
};

export const useWorkListFieldVisibility = (
  viewKey: string,
  availableKeys: readonly WorkListFieldKey[],
): readonly [
  readonly WorkListFieldKey[],
  (key: WorkListFieldKey) => void,
  () => void,
] => {
  const [overrides, setOverrides] = useState<
    Readonly<Record<string, readonly WorkListFieldKey[]>>
  >({});
  const availableSignature = availableKeys.join("\u0000");
  const stored = useMemo(
    () => readWorkListFieldVisibility(viewKey, availableKeys),
    [viewKey, availableSignature],
  );
  const selected = parseWorkListFieldVisibility(
    overrides[viewKey] ?? stored,
    availableKeys,
  );

  const save = (next: readonly WorkListFieldKey[]) => {
    const canonical = parseWorkListFieldVisibility(next, availableKeys);
    setOverrides((current) => ({ ...current, [viewKey]: canonical }));
    persistWorkListFieldVisibility(viewKey, canonical, availableKeys);
  };

  const toggle = (key: WorkListFieldKey) => {
    save(
      selected.includes(key)
        ? selected.filter((candidate) => candidate !== key)
        : [...selected, key],
    );
  };

  return [selected, toggle, () => save(recommendedFor(availableKeys))] as const;
};
