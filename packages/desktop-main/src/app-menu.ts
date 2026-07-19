import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import {
  DESKTOP_CHANNELS,
  type DesktopShellCommand,
} from "@constellation/desktop-preload/client";

// Mirrors the renderer's `navItems` shortcut assignments (RealApp.tsx).
// The renderer resolves a digit to its own surface list, so only the
// labels shown in the native menu live here.
const SURFACE_SHORTCUTS: readonly { digit: number; label: string }[] = [
  { digit: 1, label: "Tydzień" },
  { digit: 2, label: "Spotkania" },
  { digit: 3, label: "Praca" },
  { digit: 4, label: "Zadania" },
  { digit: 5, label: "Projekty" },
  { digit: 6, label: "Historia Capture" },
  { digit: 7, label: "Aktywność" },
  { digit: 8, label: "Do uwagi" },
  { digit: 9, label: "Dostęp" },
];

const sendShellCommand = (command: DesktopShellCommand): void => {
  const window = BrowserWindow.getFocusedWindow();
  if (window === null || window.isDestroyed()) return;
  window.webContents.send(DESKTOP_CHANNELS.shellCommand, command);
};

export const installApplicationMenu = (): void => {
  const onMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(onMac
      ? [{ role: "appMenu" } satisfies MenuItemConstructorOptions]
      : []),
    {
      label: "Plik",
      submenu: [
        {
          label: "Quick Capture…",
          accelerator: "CmdOrCtrl+Shift+K",
          click: () => sendShellCommand({ kind: "open-capture" }),
        },
        { type: "separator" },
        {
          label: "Zamknij kartę",
          accelerator: "CmdOrCtrl+W",
          click: () => sendShellCommand({ kind: "close-tab" }),
        },
        {
          label: "Zamknij okno",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => BrowserWindow.getFocusedWindow()?.close(),
        },
        ...(onMac
          ? []
          : ([
              { type: "separator" },
              { role: "quit", label: "Zakończ" },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      label: "Edycja",
      submenu: [
        { role: "undo", label: "Cofnij" },
        { role: "redo", label: "Ponów" },
        { type: "separator" },
        { role: "cut", label: "Wytnij" },
        { role: "copy", label: "Kopiuj" },
        { role: "paste", label: "Wklej" },
        { role: "selectAll", label: "Zaznacz wszystko" },
      ],
    },
    {
      label: "Widok",
      submenu: [
        { role: "reload", label: "Odśwież" },
        { role: "toggleDevTools", label: "Narzędzia deweloperskie" },
        { type: "separator" },
        { role: "resetZoom", label: "Rzeczywista wielkość" },
        { role: "zoomIn", label: "Powiększ" },
        { role: "zoomOut", label: "Pomniejsz" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pełny ekran" },
      ],
    },
    {
      label: "Przejdź",
      submenu: [
        {
          label: "Paleta poleceń…",
          accelerator: "CmdOrCtrl+K",
          click: () => sendShellCommand({ kind: "open-search" }),
        },
        { type: "separator" },
        ...SURFACE_SHORTCUTS.map((item): MenuItemConstructorOptions => ({
          label: item.label,
          accelerator: `CmdOrCtrl+${item.digit}`,
          click: () =>
            sendShellCommand({
              kind: "navigate-shortcut",
              digit: item.digit,
            }),
        })),
      ],
    },
    { role: "windowMenu", label: "Okno" },
    {
      role: "help",
      label: "Pomoc",
      submenu: [
        {
          label: "Skróty klawiszowe",
          accelerator: "CmdOrCtrl+/",
          click: () => sendShellCommand({ kind: "open-shortcuts" }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
