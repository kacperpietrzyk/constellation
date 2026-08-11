import type { ReactNode } from "react";

/* JEDNO PASMO TYTUŁU DLA SZEŚCIU EKRANÓW, i to jest cały powód, dla którego ten
   plik istnieje.

   Prototyp składa nagłówek KAŻDEGO ekranu jedną funkcją: `crumbbar(crumbs,
   actions)` (`v3/app.js:677-683`) rysuje pasmo z okruszkiem, rozpychaczem
   `<span class="spacer">` i drugim argumentem — akcją — na końcu. Ta aplikacja
   pisała zamiast tego `<header className="surface-header">` ręcznie na każdym
   ekranie, a jedyną kopią z zamontowanym slotem akcji był `SurfaceHeader`
   w `Wave2Surfaces.tsx`. Pięć ekranów tego lotu — Zadania, Lejek, Odnowienia,
   Organizacje, Ludzie — miało w paśmie GOŁY `<h1>` i trzymało akcję rząd niżej,
   we własnym `.crumbbar`. Reguła `justify-content: space-between` stała przy
   `.surface-header` w `styles.css` i była MARTWA, bo pasmo miało jedno dziecko.

   „Ręczna lista obok zamkniętego słownika" jest w tym repozytorium nazwaną
   klasą defektu i to jest jej wariant o układzie: pięć kopii tego samego pasma
   to pięć miejsc, w których następna zmiana pasma może się nie odbyć. Slot
   akcji stoi więc TU, raz, i przechodzi przez niego tych pięć ekranów.

   POZOSTAŁE PASMA `.surface-header` PISZĄ SIĘ DALEJ RĘCZNIE i to jest zakres,
   nie przeoczenie. Projekty i Ustawienia mają WARIANT z nadpisem i opisem
   (`Wave2Surfaces.SurfaceHeader`, `SettingsSurface.tsx`), którego nie wolno
   przepiąć tutaj bez zabrania bramce typografii nagłówków jednej z jej par —
   powód stoi wypisany przy tamtym komponencie i jest zmierzony, nie
   przypuszczony. Dziś, Kalendarz, Skrzynka i odczyt Historii przechwyceń nie
   mają akcji w paśmie ANI u nas, ANI w prototypie (spis pasma tytułu mierzy je
   jako `NO_ACTION` po obu stronach), więc ich przepisanie nie zmieniłoby ani
   jednego pomiaru; idą do lotu, który da im akcję.

   KONTRAKT: `.ui-craft/tokens.md`, „Accent rule" §2 („Where the reader can go")
   i „Usage constraints" 3 nazywają PASEK AKCJI EKRANU (`crumbbar`) jednym
   z trzech pojemników, które wolno, żeby niosły akcję z wypełnieniem akcentu —
   i dokładnie jednym takim pojemnikiem na pojemnik. Ten komponent jest naszym
   odpowiednikiem tamtego paska.

   CO Z `crumbbar` PROTOTYPU JEST TU JUŻ WZIĘTE, a co nie. Do Fazy D stał
   w tym miejscu akapit mówiący, że pasmo siedzi w kolumnie czytelnej
   (`--surface-measure`) razem z treścią, a pełna szerokość jest „zmianą większą
   niż lot" — lot D1 tę zmianę zrobił i akapit został tu nieprzepisany przez
   jeden przegląd. Stan po nim jest taki: pasmo idzie na CAŁĄ SZEROKOŚĆ kanwy
   i zamyka się własną włoskową kreską, a mechanizmem jest ujemny margines
   poziomy równy rynnie nośnika (`--surface-gutter`) plus ta sama rynna
   z powrotem jako wyściółka; w kolumnie czytania zostaje wyłącznie TREŚĆ pod
   pasmem (`.surface-scroll > *:where(:not(.surface-header, .view-band))`).
   Liczby i powód stoją przy regule `.surface-header` w `styles.css` i nie są
   tu przepisywane.

   CZEGO DALEJ NIE MA: pasma prototypu są RODZEŃSTWEM przewijanego nośnika
   (`v3/app.css:282-303` — `.crumbbar`, `.viewbar`, potem `.scroller`), a nasze
   siedzą w środku niego, więc przewijają się razem z treścią. To jest jedyna
   pozostała różnica kształtu i jest nieoddana, a nie zaprzeczona. */

export const SurfaceTitleBand = ({
  title,
  action,
}: {
  readonly title: string;
  /** Akcja główna ekranu, malowana `.primary-button` tam, gdzie prototyp maluje
   *  `.btn.primary`. Nieobecna znaczy „ten ekran nie ma akcji głównej" — i to
   *  jest odpowiedź, którą spis pasma tytułu mierzy tak samo jak każdą inną. */
  readonly action?: ReactNode;
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
  /* KLASA JEST LITERAŁEM I MA NIM ZOSTAĆ. Bramka typografii nagłówków czyta
     literalne `className="a b"` i z nich wylicza, które klasy jadą zawsze razem
     — to jest jedyny powód, dla którego `.surface-header h1` pokrywa
     `.wave2-header h1`. Slot na modyfikator sklejany w czasie działania
     zabierałby tej mapie każdą parę, którą ten komponent by przejął; pełna
     historia stoi przy `SurfaceHeader` w `Wave2Surfaces.tsx`. */
  return (
    <header className="surface-header">
      {/* GOŁY `<h1>`, BEZ OPAKOWANIA W `<div>`: `space-between` rozdziela DWOJE
          dzieci pasma niezależnie od tego, czy pierwszym jest nagłówek, czy
          grupa tekstu, a wstawienie tu pudełka zmieniłoby drzewo pod parami,
          które już są zielone, w locie mającym ruszyć wyłącznie miejsce
          akcji. */}
      {heading}
      {action}
    </header>
  );
};
