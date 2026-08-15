import { ChoicePopover, FieldPopover } from "../components/ChoicePopover.js";
import { Icon } from "../components/Icon.js";
import { TASK_SORT_LABELS, type TaskSort } from "./task-view.js";

/* CZTERY PIGUŁKI PASA WIDOKU ZADAŃ — wpisy 4-1 i 4-2, Faza II, lot L6.
   Wybór jest przyciskiem otwierającym rysowane menu; cytat z obu stron
   i mechanika stoją w nagłówku `components/ChoicePopover.tsx`.

   DLACZEGO TO JEST OSOBNY PLIK, A NIE CZTERY WYWOŁANIA W `TasksSurface`
   — POMIAR, NIE PORZĄDKI. `TasksSurface` jest importowany statycznie przez
   `RealApp.tsx`, czyli siedzi na ŚCIEŻCE GORĄCEJ, a ta miała przed tym lotem
   192 B zapasu gzip (zmierzone: 173 808 B przy suficie 174 000 B). Pierwsza
   wersja tej dostawy trzymała cztery wywołania wprost w `TasksSurface` i dwa
   `lazy()` obok siebie — sam KOMPONENT był wtedy leniwy, ale jego JSX,
   z mapowaniem opcji, budowaniem etykiet i predykatami, zostawał w gorącym
   chunku. Zmierzone: +186 B gzip z pozostałych 192. Po przeniesieniu całego
   bloku tutaj gorąca zostaje jedna linia `lazy()` i pięć propsów.

   PROPSY, NIE WARTOŚCI Z MODUŁU GORĄCEGO. Ten plik importuje `TASK_SORT_LABELS`
   z `task-view.js`, który i tak jest na ścieżce gorącej (czyta go sam ekran),
   więc nie wciąga niczego z powrotem; `Icon` ma własny chunk. Reszta —
   grupowania, widoki, stan filtra — przychodzi propsami. Leniwy import WARTOŚCI
   z modułu, którego na gorącej ścieżce NIE MA, wciągnąłby go tam z powrotem
   i jest to w tym repozytorium nazwana pułapka. */

export const TaskViewControls = ({
  activeViewId,
  groupingOptions,
  groupingValue,
  onChooseView,
  onGrouping,
  onSearch,
  onSort,
  savedViews,
  search,
  sort,
  sorts,
}: {
  readonly activeViewId: string | undefined;
  readonly groupingOptions: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly groupingValue: string;
  readonly onChooseView: (savedViewId: string) => void;
  readonly onGrouping: (value: string) => void;
  readonly onSearch: (value: string) => void;
  readonly onSort: (value: TaskSort) => void;
  /** Widoki, które da się otworzyć — już przefiltrowane przez ekran, bo to on
   *  zna słowo `active` i on odczytuje projekcję. */
  readonly savedViews: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly search: string;
  readonly sort: TaskSort;
  /** Porządki, w kolejności, w jakiej stoją w menu. PODANE, a nie wpisane tu
   *  drugi raz: `SORTS` mieszka w `TasksSurface` i wpisanie tej samej trójki
   *  tutaj byłoby ręczną listą obok zamkniętego słownika — nazwaną w tym
   *  repozytorium klasą wady, trafioną już sześć razy. */
  readonly sorts: readonly TaskSort[];
}) => (
  <>
    <FieldPopover
      fieldLabel="Filter by title, project or person"
      onChange={onSearch}
      panelLabel="Filter these tasks"
      placeholder="Type to filter"
      trigger={search.trim() === "" ? "Filter" : `Filter: ${search}`}
      triggerId="tasks-search"
      value={search}
    />
    {/* „All views" NIESIE LICZBĘ, bo prototyp ją niesie (`v3/screens/tasks.js:
        510-511` — `All views<span class="n">${SAVED_VIEWS.length}</span>`).
        Liczba jest o JEDEN większa od liczby NASZYCH zapisanych widoków, i to
        jest ta sama arytmetyka, nie odstępstwo: prototypowa tablica
        `SAVED_VIEWS` (`v3/data.js:352-353`) NIESIE „All work" jako swój
        PIERWSZY element (`{ id: "all", name: "All work", conditions: [] }`),
        więc jego `length` liczy siedem widoków razem z nią. U nas „All work"
        nie jest zapisanym widokiem, tylko brakiem wybranego — stąd `+ 1`.

        GLIF `list` JEST PRZEPISANY Z PROTOTYPU, ALE NIE Z TEGO PASA, i to jest
        poprawka po przeglądzie: `icon("list")` stoi w `crumbbar(...)`
        (`v3/screens/tasks.js:509-512`), czyli w paśmie nad pasem widoku, przy
        tej samej pigułce „All views" i z tą samą liczbą. Sam `.viewbar`
        prototypu (`:514-531`) niesie CZTERY inne glify — `filter`, `group`,
        `sort` i `fields` — i żadnego `list`. Pierwsza wersja tego zdania
        mówiła „jedyny glif, który prototyp NAPRAWDĘ stawia w tym pasie" i była
        nieprawdziwa o prototypie w tym samym akapicie, w którym obok stoi
        zapis, że „All views" siedzi w `crumbbar`. Glif jedzie więc razem
        z pigułką, do której należy; pozostałym trzem glifu NIE wymyślamy,
        i to jest osobny powód (`Icon.tsx` nie ma `filter`, `group` ani `sort`,
        a dziesięć glifów kosztowało kiedyś 328 B gzip). Przeniesienie samej
        pigułki do pasma tytułu to wpis 4-5, własność innego lotu. */}
    <ChoicePopover
      choices={[
        { value: "", label: "All work" },
        ...savedViews.map((view) => ({ value: view.id, label: view.name })),
      ]}
      glyph={<Icon name="list" />}
      onChoose={onChooseView}
      panelLabel="Which view of this work"
      trigger={`All views ${savedViews.length + 1}`}
      triggerId="tasks-view"
      value={activeViewId ?? ""}
    />
    <ChoicePopover
      choices={groupingOptions}
      onChoose={onGrouping}
      panelLabel="Group these tasks by"
      trigger={`Group: ${groupingOptions.find((candidate) => candidate.value === groupingValue)?.label ?? "None"}`}
      triggerId="tasks-group"
      value={groupingValue}
    />
    <ChoicePopover
      choices={sorts.map((candidate) => ({
        value: candidate,
        label: TASK_SORT_LABELS[candidate],
      }))}
      onChoose={(chosen) => onSort(chosen as TaskSort)}
      panelLabel="Sort these tasks by"
      trigger={`Sort: ${TASK_SORT_LABELS[sort]}`}
      triggerId="tasks-sort"
      value={sort}
    />
  </>
);
