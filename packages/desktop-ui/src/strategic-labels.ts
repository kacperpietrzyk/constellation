import type { RelationshipWorkspaceProjection } from "./client/workflow.js";

type StrategicRecord = RelationshipWorkspaceProjection["records"][number];

// Wspólny słownik polskich etykiet stanów rekordów strategicznych; konsumuje
// go powierzchnia Relacje oraz inspector w RealApp, żeby stan czytał się
// identycznie po obu stronach shellu. Moduł jest wydzielony z
// StrategicDepthSurface, aby stale obecny inspector nie wciągał całej
// powierzchni do wejściowego chunku renderera.
export const strategicStateLabels: { readonly [state: string]: string } = {
  active: "Aktywne",
  pursued: "W toku",
  stale: "Wygasłe",
  watching: "Obserwowane",
  open: "Otwarte",
  resolved: "Rozstrzygnięte",
  renewed: "Odnowione",
  current: "Aktualna",
  superseded: "Zastąpiona",
  prospect: "Potencjalna",
  inactive: "Nieaktywna",
  deferred: "Odłożona",
  rejected: "Odrzucona",
  lost: "Przegrana",
  draft: "Szkic",
  ready: "Gotowa",
  submitted: "Złożona",
  accepted: "Przyjęta",
  declined: "Odrzucona",
  not_renewing: "Bez odnowienia",
  irrelevant: "Nieistotne",
  conflicted: "Sprzeczny",
  paused: "Wstrzymana",
  ended: "Zakończona",
  pending: "Oczekuje",
  saved: "Zachowany",
  dismissed: "Odrzucony",
};

export const recurrenceCadenceLabels: {
  readonly [
    cadence in Extract<StrategicRecord, { kind: "recurrence" }>["cadence"]
  ]: string;
} = {
  daily: "codziennie",
  weekly: "co tydzień",
  monthly: "co miesiąc",
  yearly: "co rok",
};
