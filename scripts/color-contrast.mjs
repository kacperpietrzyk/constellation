// Jedyna implementacja matematyki koloru w tym repo. Powstała, bo bramka
// `css-token-lint` PINOWAŁA literał `oklch(52% <chroma> <hue>)` i twierdziła
// w komentarzu, że te wartości „mierzą co najmniej 4.98:1" — a w drzewie NIE BYŁO
// NICZEGO, czym można by to policzyć. Liczba wpisana z zewnątrz jest nieodróżnialna
// od liczby zmyślonej; ten plik zamienia ją w pomiar.
//
// Zero zależności zewnętrznych — dokładnie po to, żeby mogła jej używać zarówno
// bramka czytająca `tokens.css` z dysku, jak i sonda wizualna czytająca
// WYLICZONE kolory z Chromium (`getComputedStyle` zwraca `rgb(...)`, nigdy
// nazwę tokenu, więc akcent trzeba rozpoznać po CHROMIE i ODCIENIU).
//
// Uwaga na dwie linearyzacje, które łatwo pomylić, bo różnią się na trzecim
// miejscu po przecinku:
//   * odwrotność sRGB (próg 0.04045) — używana w konwersji do OKLab,
//   * definicja WCAG (próg 0.03928) — używana WYŁĄCZNIE w `relativeLuminance`.
// WCAG cytuje starszą wersję progu i tak jest zdefiniowany współczynnik
// kontrastu, więc nie „poprawiamy" go do wersji nowszej.

/** Próg WCAG 2.x AA dla tekstu o normalnej wielkości. */
export const WCAG_AA_NORMAL_TEXT = 4.5;

// Ile poza [0, 1] może wyjść kanał liniowy, zanim uznamy kolor za spoza gamutu.
// Czysty zaokrągleniowy szum konwersji siedzi rzędy wielkości niżej.
const GAMUT_TOLERANCE = 1e-6;

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/**
 * Liczba z literału CSS. `percentScale` mówi, ile znaczy 100% w tym kanale
 * (dla jasności OKLCH — 1, dla chromy — 0.4, dla alfy — 1).
 */
const parseComponent = (raw, percentScale, what) => {
  const text = String(raw).trim();
  if (text === "" || text === "none") {
    throw new Error(
      `Nie umiem odczytać składowej ${what} z „${raw}". Słowo kluczowe \`none\` ` +
        "nie jest obsługiwane — podaj wartość liczbową.",
    );
  }
  const percent = text.endsWith("%");
  const value = Number.parseFloat(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(value)) {
    throw new Error(`Nie umiem odczytać składowej ${what} z „${raw}".`);
  }
  return percent ? (value / 100) * percentScale : value;
};

const OKLCH_PATTERN =
  /^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/]+)\s*(?:\/\s*([^\s/]+)\s*)?\)$/i;

/**
 * Literał `oklch(L C H)` albo `oklch(L C H / A)` → `{ l, c, h, alpha }`.
 * `l` i `alpha` w skali 0..1, `c` w jednostkach OKLCH (0.4 = 100%),
 * `h` w stopniach.
 */
export const parseOklch = (literal) => {
  const match = OKLCH_PATTERN.exec(String(literal).trim());
  if (!match) {
    throw new Error(`To nie jest literał oklch(): „${literal}".`);
  }
  const [, rawL, rawC, rawH, rawAlpha] = match;
  const hueText = rawH.replace(/deg$/i, "");
  return {
    space: "oklch",
    l: parseComponent(rawL, 1, "jasności"),
    c: parseComponent(rawC, 0.4, "chromy"),
    h: parseComponent(hueText, 360, "odcienia"),
    alpha: rawAlpha === undefined ? 1 : parseComponent(rawAlpha, 1, "alfy"),
  };
};

const RGB_PATTERN = /^rgba?\(([^)]*)\)$/i;

/**
 * Literał `rgb(r, g, b)`, `rgba(r, g, b, a)`, `rgb(r g b)` albo `rgb(r g b / a)`
 * → `{ r, g, b, alpha }` z kanałami w skali 0..255. To jest kształt, który
 * zwraca `getComputedStyle` w Chromium (obie składnie, zależnie od wersji).
 */
export const parseRgb = (literal) => {
  const match = RGB_PATTERN.exec(String(literal).trim());
  if (!match) {
    throw new Error(`To nie jest literał rgb()/rgba(): „${literal}".`);
  }
  const [channels, alphaPart] = match[1].split("/");
  const parts = channels
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.length !== 3 && parts.length !== 4) {
    throw new Error(
      `Literał rgb() ma ${parts.length} składowych zamiast 3 lub 4: „${literal}".`,
    );
  }
  const [rawR, rawG, rawB, rawAlphaFromComma] = parts;
  const rawAlpha = alphaPart === undefined ? rawAlphaFromComma : alphaPart;
  return {
    space: "srgb",
    r: parseComponent(rawR, 255, "czerwonej"),
    g: parseComponent(rawG, 255, "zielonej"),
    b: parseComponent(rawB, 255, "niebieskiej"),
    alpha: rawAlpha === undefined ? 1 : parseComponent(rawAlpha, 1, "alfy"),
  };
};

const HEX_PATTERN = /^#([0-9a-f]{3,8})$/i;

/** Literał `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` → `{ r, g, b, alpha }`. */
export const parseHex = (literal) => {
  const match = HEX_PATTERN.exec(String(literal).trim());
  if (!match) {
    throw new Error(`To nie jest literał szesnastkowy: „${literal}".`);
  }
  const digits = match[1];
  const expand =
    digits.length === 3 || digits.length === 4
      ? [...digits].map((digit) => digit + digit).join("")
      : digits;
  if (expand.length !== 6 && expand.length !== 8) {
    throw new Error(`Literał szesnastkowy ma złą długość: „${literal}".`);
  }
  const channel = (index) =>
    Number.parseInt(expand.slice(index * 2, index * 2 + 2), 16);
  return {
    space: "srgb",
    r: channel(0),
    g: channel(1),
    b: channel(2),
    alpha: expand.length === 8 ? channel(3) / 255 : 1,
  };
};

/** Dowolny z obsługiwanych literałów → kolor w swojej przestrzeni. */
export const parseColor = (literal) => {
  const text = String(literal).trim();
  if (text.startsWith("#")) return parseHex(text);
  if (/^oklch\(/i.test(text)) return parseOklch(text);
  if (/^rgba?\(/i.test(text)) return parseRgb(text);
  throw new Error(
    `Nie umiem rozłożyć koloru „${literal}" — obsługiwane są oklch(), rgb()/rgba() ` +
      "i literał szesnastkowy. Zgłoś to zamiast zgadywać.",
  );
};

// Kodowanie i dekodowanie krzywej sRGB (IEC 61966-2-1, próg 0.04045).
const srgbToLinear = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const linearToSrgb = (channel) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;

/**
 * OKLCH → sRGB. Kanały wynikowe są w skali 0..255 i SĄ przycięte do gamutu,
 * ale fakt przycięcia jest ZGŁOSZONY: `outOfGamut` i `gamutExcess` (największe
 * wyjście kanału liniowego poza [0, 1]). Ciche klipowanie zamieniłoby kolor,
 * którego ekran nie umie pokazać, w kolor, który wygląda na poprawny — i pomiar
 * kontrastu dotyczyłby wtedy czegoś innego niż wartość w arkuszu.
 */
export const oklchToSrgb = (color) => {
  const { l, c, h, alpha = 1 } = color;
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;

  const lCone = lRoot ** 3;
  const mCone = mRoot ** 3;
  const sCone = sRoot ** 3;

  const linear = [
    4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  ];

  let gamutExcess = 0;
  for (const channel of linear) {
    if (channel < 0) gamutExcess = Math.max(gamutExcess, -channel);
    if (channel > 1) gamutExcess = Math.max(gamutExcess, channel - 1);
  }

  const [r, g, blue] = linear.map(
    (channel) => linearToSrgb(clamp01(channel)) * 255,
  );

  return {
    space: "srgb",
    r,
    g,
    b: blue,
    alpha,
    outOfGamut: gamutExcess > GAMUT_TOLERANCE,
    gamutExcess,
  };
};

/**
 * sRGB (0..255) → OKLCH. Kierunek potrzebny sondzie wizualnej: przeglądarka
 * oddaje `rgb(...)`, a pytanie brzmi „czy to jest akcent", czyli pytanie
 * o CHROMĘ i ODCIEŃ, nie o nazwę tokenu.
 */
export const srgbToOklch = (color) => {
  const { r, g, b, alpha = 1 } = color;
  const lLin = srgbToLinear(r / 255);
  const mLin = srgbToLinear(g / 255);
  const sLin = srgbToLinear(b / 255);

  const lCone = 0.4122214708 * lLin + 0.5363325363 * mLin + 0.0514459929 * sLin;
  const mCone = 0.2119034982 * lLin + 0.6806995451 * mLin + 0.1073969566 * sLin;
  const sCone = 0.0883024619 * lLin + 0.2817188376 * mLin + 0.6299787005 * sLin;

  const lRoot = Math.cbrt(lCone);
  const mRoot = Math.cbrt(mCone);
  const sRoot = Math.cbrt(sCone);

  const lightness =
    0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const aAxis =
    1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const bAxis =
    0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;

  const chroma = Math.hypot(aAxis, bAxis);
  const hue = ((Math.atan2(bAxis, aAxis) * 180) / Math.PI + 360) % 360;

  return { space: "oklch", l: lightness, c: chroma, h: hue, alpha };
};

/** Kolor w dowolnym z obsługiwanych zapisów → sRGB 0..255. */
export const toSrgb = (color) => {
  const value = typeof color === "string" ? parseColor(color) : color;
  return value.space === "oklch" ? oklchToSrgb(value) : { ...value };
};

/**
 * Kolor z alfą nałożony na NIEPRZEZROCZYSTE tło. Mieszanie idzie w zapisie
 * gamma (tak składa przeglądarka), a nie liniowo — to nie jest szczegół,
 * bo dla `--status-*-bg` przy 10% różnica między jedną a drugą przestrzenią
 * przesuwa zmierzony kontrast.
 */
export const compositeOver = (foreground, background) => {
  const fg = toSrgb(foreground);
  const bg = toSrgb(background);
  if (bg.alpha !== undefined && bg.alpha < 1) {
    throw new Error(
      `Tło kompozycji musi być nieprzezroczyste, a ma alfę ${bg.alpha}. ` +
        "Złóż je najpierw na czymś nieprzezroczystym.",
    );
  }
  const alpha = fg.alpha === undefined ? 1 : fg.alpha;
  return {
    space: "srgb",
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    alpha: 1,
  };
};

/**
 * Luminancja względna wg WCAG 2.x. Próg 0.03928 jest tu CELOWY — tak brzmi
 * definicja, do której odwołuje się próg 4.5:1.
 */
export const relativeLuminance = (color) => {
  const { r, g, b } = toSrgb(color);
  const linear = [r, g, b].map((channel) => {
    const scaled = clamp01(channel / 255);
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

/**
 * Współczynnik kontrastu WCAG 2.x między dwoma NIEPRZEZROCZYSTYMI kolorami.
 * Kolor z alfą jest odrzucany, a nie po cichu traktowany jak nieprzezroczysty:
 * „tekst statusu na swoim tle" to pytanie o kolor PO złożeniu, a nie o token.
 */
export const contrastRatio = (foreground, background) => {
  const fg = toSrgb(foreground);
  const bg = toSrgb(background);
  for (const [label, color] of [
    ["pierwszy plan", fg],
    ["tło", bg],
  ]) {
    if (color.alpha !== undefined && color.alpha < 1) {
      throw new Error(
        `Kontrast liczy się tylko dla kolorów nieprzezroczystych, a ${label} ma alfę ` +
          `${color.alpha}. Użyj najpierw compositeOver().`,
      );
    }
  }
  const lighter = Math.max(relativeLuminance(fg), relativeLuminance(bg));
  const darker = Math.min(relativeLuminance(fg), relativeLuminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
};
