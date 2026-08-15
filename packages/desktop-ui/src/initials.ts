/* JEDEN KSZTAŁT INICJAŁÓW DLA CAŁEJ APLIKACJI, i to jest naprawa po przeglądzie
 * adwersarialnym wpisu 10-3.
 *
 * Wpis 10-3 dopisał na Spotkaniach szósty egzemplarz tego samego algorytmu
 * i opisał go w komentarzu jako „TEN SAM kształt, co na Organizacjach, a nie
 * drugi obok niego". Zdanie było nieprawdziwe: był to drugi obok niego, a poza
 * nim żyły jeszcze cztery. Zmierzone przed naprawą — pięć niezależnych
 * przepisań `name.split(/\s+/u).filter(Boolean).slice(0, 2)…`:
 * `StrategicDepthSurface.tsx`, `pipeline/PipelineSurface.tsx`,
 * `people/PeopleSurface.tsx`, `renewals/RenewalsSurface.tsx`
 * i `tasks/TaskTableLayout.tsx` — plus nowe na Spotkaniach. Numerów linii przy
 * tych nazwach NIE MA celowo: wszystkie pięć miejsc ta naprawa właśnie
 * przepisała, więc każdy numer wskazywałby na kod, którego tam już nie ma.
 * To jest dokładnie
 * klasa `restated-shape-drift` z pamięci projektu: ten sam kształt przepisany
 * w kilku miejscach rozjeżdża się po cichu i żaden przyrząd tego nie widzi.
 *
 * DWIE RÓŻNICE, KTÓRE TO PRZEPISANIE MIAŁO, I DLACZEGO ROZSTRZYGNIĘTE TAK:
 *
 *   • `[...part][0]` zamiast `part.slice(0, 1)`. `slice` tnie po JEDNOSTKACH
 *     KODOWYCH, więc imię zaczynające się znakiem spoza BMP (emoji, część
 *     pisma historycznego) dostawało POŁÓWKĘ pary zastępczej — znak zastępczy
 *     na ekranie. Iteracja po ciągu idzie po punktach kodowych i tej wady nie
 *     ma; wybrana jest wersja poprawna, a nie wersja liczniejsza.
 *   • Znak zapytania dla imienia, z którego nic nie zostaje. Pięć z sześciu
 *     przepisań zwracało wtedy pusty napis, a `<span>` bez tekstu ma ZEROWĄ
 *     szerokość — czyli awatar, którego nikt nie widzi i którego żadna para
 *     licząca „narysowane" nie policzy. Prototyp rozstrzyga to tak samo:
 *     `avatar()` (`v3/app.js:104`) drukuje `?`, gdy osoby nie zna.
 *     `tasks/TaskTableLayout.tsx` miało ten zapasowy znak jako jedyne z sześciu
 *     i jego powód („żeby kolumna była zajęta") jest tu przejęty dosłownie.
 */
export const initialsOf = (name: string): string => {
  const letters = name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => [...part][0] ?? "")
    .join("");
  return letters === "" ? "?" : letters.toUpperCase();
};
