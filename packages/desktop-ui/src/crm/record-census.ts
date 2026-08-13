// ILE JEST REKORDÓW JEDNEGO RODZAJU — jedno zdanie, dwa czytelniki.
//
// Powstało dla wpisów #50 i #66 rejestru (liczniki przy pozycjach nawigacji),
// i powstało jako OSOBNY plik, a nie jako dwie linijki w powłoce, z jednego
// powodu: liczba przy celu i ekran pod tym celem MUSZĄ mówić to samo.
// `RealApp.tsx:1829-1837` nosi zapisany dowód, co się dzieje, kiedy nie mówią —
// pasek boczny pokazywał „100" obok ekranu mówiącego „157 tasks", bo brał inne
// zapytanie. `projectNavChildren` w tym samym pliku nosi bliźniaczy dowód
// z drugiej strony: pierwsza wersja czytała `work.overview.projects`, w fiksturze
// pustą, i drugi poziom nawigacji był pusty przy niepustej kolekcji.
//
// DLACZEGO NIE `indexRelationships`. Ta funkcja (`crm/organization-reading.ts`)
// jest prawdziwym czytelnikiem tej samej listy i to ona zna wszystkie reguły
// CRM — ale ma 514 linii i mieszka w chunku LENIWYM. Zaimportowanie jej do
// `RealApp.tsx` wciągnęłoby cały moduł na ścieżkę gorącą (ta pułapka ma
// w tym repozytorium nazwę: leniwy import WARTOŚCI z modułu wyciąga moduł),
// a powłoka przebudowywałaby pełny indeks map przy każdym renderze, żeby
// przeczytać z niego cztery długości.
//
// DLATEGO WSPÓLNY JEST PREDYKAT, A NIE PRZEBIEG. `isLiveRecord` niżej jest
// JEDYNYM miejscem, w którym zapisano, co znaczy „ten rekord się liczy",
// i `indexRelationships` czyta je stąd. Bez tego byłyby dwa zdania o jednym
// kształcie w dwóch plikach — nazwana klasa defektu tego repozytorium
// (`restated-shape-drift`): usunięty klient przestałby znikać z licznika przy
// pierwszej zmianie któregokolwiek z nich, i nikt by tego nie zobaczył.
//
// CZEGO TU NIE MA: żadnej reguły „otwarte" kontra „zamknięte". Sprawdzone
// w ekranach, nie założone — `readBoard` (`pipeline/pipeline-view.ts:368`)
// stawia na tablicy KAŻDĄ szansę, łącznie z wygranymi i przegranymi, bo etap
// końcowy jest kolumną jak każda inna; `readRenewals`
// (`renewals/renewals-view.ts:454`) buduje odczyt z KAŻDEGO odnowienia
// w indeksie i zamyka je dopiero sekcją, nie filtrem. Prototyp filtruje tam
// oba (`v3/app.js:581`, `:589`), bo jego ekrany filtrują tak samo; nasze nie,
// więc licznik, który by filtrował, kłamałby wobec ekranu pod sobą.
import type { RelationshipWorkspaceProjection } from "../client/workflow.js";

type StrategicRecord = RelationshipWorkspaceProjection["records"][number];

/**
 * Czy rekord w ogóle się liczy.
 *
 * Usunięty rekord ZOSTAJE w projekcji — o tym, czy jest, mówi `recordState` —
 * a czytanie ponad tym polem jest sposobem, w jaki skasowany klient dalej stoi
 * w sumie.
 *
 * BRAK POLA ZNACZY „ŻYWY", I TO NIE JEST ostrożność — to jest cała poprawka
 * z PR #232: domena NIE STEMPLUJE `recordState` przy tworzeniu, więc predykat
 * pytający o równość z `"active"` wyrzucał KAŻDY rekord, jaki produkt zapisał,
 * i ekrany CRM rysowały pustkę. Wersja ścisła wróciła tu na chwilę przy scalaniu
 * fali wizualnej z mainem — dwie nazwy tego samego zdania rozjechały się
 * ZNACZENIEM, dokładnie tak, jak ostrzega akapit wyżej.
 *
 * Typ jest STRUKTURALNY, a nie `StrategicRecord`, żeby to samo zdanie obsłużyło
 * oba wywołania (`countLiveRecords` tutaj i `recordIsLive` w odczycie relacji)
 * i żeby nie było powodu napisać go po raz trzeci.
 */
export const isLiveRecord = (record: {
  readonly recordState?: "active" | "removed" | undefined;
}): boolean => (record.recordState ?? "active") === "active";

/** Ile żywych rekordów tego rodzaju niesie odczyt przestrzeni relacji. */
export const countLiveRecords = (
  records: readonly StrategicRecord[],
  kind: StrategicRecord["kind"],
): number => {
  let total = 0;
  for (const record of records)
    if (record.kind === kind && isLiveRecord(record)) total += 1;
  return total;
};
