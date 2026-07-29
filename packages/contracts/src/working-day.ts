import { z } from "zod";

/**
 * Dzień roboczy: minuty od lokalnej północy w strefie workspace'u i dni tygodnia
 * w numeracji ISO (1 = poniedziałek). JEDEN kształt dla komendy, wyniku i
 * odczytu — do 0.2.0 osiem godzin było wpisane w kod ekranu dnia, a kształt
 * przepisany w kilku schematach to rodzina błędów, która trafiła nas już trzy
 * razy przy filtrach zapisanych widoków.
 *
 * Granice są sprawdzane tutaj, bo pojemność liczona z końca wcześniejszego niż
 * początek to liczba ujemna podana ekranowi jako fakt.
 */
export const WorkingDaySchema = z
  .object({
    startMinute: z
      .int()
      .min(0)
      .max(24 * 60 - 1),
    endMinute: z
      .int()
      .min(1)
      .max(24 * 60),
    weekdays: z
      .array(z.int().min(1).max(7))
      .min(1)
      .max(7)
      .refine((days) => new Set(days).size === days.length, {
        message: "workingDay.weekdays must not repeat a day.",
      }),
  })
  .strict()
  .refine((day) => day.startMinute < day.endMinute, {
    message: "workingDay must end after it starts.",
  });

export type WorkingDayContract = z.infer<typeof WorkingDaySchema>;

/**
 * Wartość, której workspace używa, dopóki nikt jej nie ustawił. Stoi w
 * kontraktach, a nie w domenie, bo sięga po nią także renderer (harnessy
 * deweloperskie budują projekcję ręcznie) — a domena nie jest stamtąd
 * osiągalna. JEDEN egzemplarz; projekcje niosą wartość skuteczną, więc żaden
 * ekran produkcyjny nie ma powodu jej czytać.
 */
export const DEFAULT_WORKING_DAY: WorkingDayContract = {
  startMinute: 9 * 60,
  endMinute: 17 * 60,
  weekdays: [1, 2, 3, 4, 5],
};
