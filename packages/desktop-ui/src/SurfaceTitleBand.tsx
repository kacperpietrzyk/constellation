import type { ReactNode } from "react";

/* JEDNO PASMO TYTUŁU DLA SZEŚCIU EKRANÓW, i to jest cały powód, dla którego ten
   plik istnieje.

   Prototyp składa nagłówek KAŻDEGO ekranu jedną funkcją: `crumbbar(crumbs,
   actions)` (`v3/app.js:677-683`) rysuje pasmo z okruszkiem, rozpychaczem
   `<span class="spacer">` i drugim argumentem — akcją — na końcu. Ta aplikacja
   pisała zamiast tego `<header className="surface-header">` ręcznie na każdym
   ekranie, a jedyną kopią z zamontowanym slotem akcji był `SurfaceHeader`
   w `Wave2Surfaces.tsx`. Pięć pozostałych — Zadania, Lejek, Odnowienia,
   Organizacje, Ludzie — miało w paśmie GOŁY `<h1>` i trzymało akcję rząd niżej,
   we własnym `.crumbbar`. Reguła `justify-content: space-between` stała przy
   `.surface-header` w `styles.css` i była MARTWA, bo pasmo miało jedno dziecko.

   „Ręczna lista obok zamkniętego słownika" jest w tym repozytorium nazwaną
   klasą defektu i to jest jej wariant o układzie. Slot akcji stoi więc TU, raz,
   i przechodzą przez niego wszystkie sześć — pięć wprost, a Projekty przez
   `Wave2Surfaces.SurfaceHeader`, który od lotu C2 do tego komponentu deleguje.

   CZTERY EKRANY DALEJ PISZĄ TO PASMO RĘCZNIE i to jest zakres, nie przeoczenie:
   Dziś, Kalendarz, Skrzynka i odczyt Historii przechwyceń. Żaden z nich nie ma
   akcji w paśmie ANI u nas, ANI w prototypie (spis pasma tytułu mierzy je jako
   `NO_ACTION` po obu stronach), więc przepisanie ich nie zmieniłoby ani jednego
   pomiaru — a lot, który rusza cudze drzewo bez pomiaru, który to widzi, jest
   w tym repozytorium osobną klasą kłopotu. Idą do lotu, który da im akcję.

   KONTRAKT: `.ui-craft/tokens.md`, „Accent rule" §2 („Where the reader can go")
   i „Usage constraints" 3 nazywają PASEK AKCJI EKRANU (`crumbbar`) jednym
   z trzech pojemników, które wolno, żeby niosły akcję z wypełnieniem akcentu —
   i dokładnie jednym takim pojemnikiem na pojemnik. Ten komponent jest naszym
   odpowiednikiem tamtego paska.

   DLACZEGO TO NIE JEST PEŁNY `crumbbar` PROTOTYPU: pasmo prototypu ciągnie się
   przez całe płótno i ma własną dolną krawędź, a nasze siedzi w kolumnie
   czytelnej (`--surface-measure`) razem z treścią. Ta różnica jest ŚWIADOMA
   i opisana przy regule `.surface-header` w `styles.css` — przeniesienie pasma
   na pełną szerokość przesunęłoby poziome wyrównanie na jedenastu
   powierzchniach naraz i jest zmianą większą niż lot, który przenosi akcje. */

export const SurfaceTitleBand = ({
  title,
  action,
  kicker,
  description,
  className,
}: {
  readonly title: string;
  /** Akcja główna ekranu, malowana `.primary-button` tam, gdzie prototyp maluje
   *  `.btn.primary`. Nieobecna znaczy „ten ekran nie ma akcji głównej" — i to
   *  jest odpowiedź, którą spis pasma tytułu mierzy tak samo jak każdą inną. */
  readonly action?: ReactNode;
  readonly kicker?: string;
  readonly description?: string;
  readonly className?: string;
}) => {
  /* `id="surface-title"` i `tabIndex={-1}` są WYMAGANE, nie ozdobne: powłoka
     nazywa nimi całe pole pracy (`aria-labelledby="surface-title"`) i wysyła
     tam ognisko po zmianie celu. Nagłówek bez nich zostawia pole pracy bez
     nazwy i wysyła ognisko na panel — cicho i tylko dla klawiatury. */
  const heading = (
    <h1 id="surface-title" tabIndex={-1}>
      {title}
    </h1>
  );
  return (
    <header
      className={
        className === undefined
          ? "surface-header"
          : `surface-header ${className}`
      }
    >
      {/* GOŁY `<h1>` TAM, GDZIE NIE MA NADPISU ANI OPISU, i to nie jest
          oszczędność znaczników: opakowanie go w `<div>` na wszystkich sześciu
          ekranach zmieniłoby drzewo pod parami, które już są zielone, w locie,
          który miał ruszyć wyłącznie miejsce akcji. Oba kształty równają się
          tak samo — `space-between` rozdziela DWOJE dzieci pasma niezależnie od
          tego, czy pierwszym jest nagłówek, czy grupa tekstu. */}
      {kicker === undefined && description === undefined ? (
        heading
      ) : (
        <div>
          {kicker !== undefined && <p className="eyebrow">{kicker}</p>}
          {heading}
          {description !== undefined && <p>{description}</p>}
        </div>
      )}
      {action}
    </header>
  );
};
