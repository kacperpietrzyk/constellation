import type { AccessProjection } from "./client/workflow.js";
import type { DataSlice } from "./client/workflow.js";

// KTO CZYTA — JEDNA DEFINICJA NA CAŁĄ APLIKACJĘ.
//
// Lot L11 wyprowadził to imię w `RealApp` dla stopki paska bocznego. Lot L3
// potrzebuje go po raz drugi, w powitaniu na Dzisiaj — a „ten sam kształt
// przepisany w drugim miejscu" jest w tym repozytorium nazwaną klasą defektu
// (pamięć: „Restated-shape drift"; ten sam kształt trafiony trzy razy przez
// filtry saved-view). Dlatego reguła stoi RAZ, a oba miejsca ją wołają.
//
// CZEGO TA FUNKCJA NIE ROBI: nie zgaduje. `undefined` znaczy „nie dało się
// zapytać" i wołający ma z tym zrobić to, co należy do JEGO powierzchni —
// stopka nie rysuje nic (`RealApp.tsx`, reguła L11: żadnych zastępników
// w miejscu człowieka), a powitanie degraduje TEKST, nie element, bo znikający
// nagłówek skasowałby otwarcie ekranu.
//
// TO NIE JEST `Person` Z GRAFU. Ludzie w grafie nigdy nie logują się do tej
// aplikacji; czytelnikiem jest principal z `workspace.access`.

export const viewerDisplayName = (
  access: DataSlice<AccessProjection>,
): string | undefined =>
  access.kind === "ready"
    ? access.data.members.find(
        (member) => member.principalId === access.data.currentPrincipalId,
      )?.displayName
    : undefined;
