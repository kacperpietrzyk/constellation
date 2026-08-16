import { BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import {
  DESKTOP_CHANNELS,
  type DesktopShellCommand,
} from "@constellation/desktop-preload/client";
import { desktopSurfaceRegistry } from "@constellation/desktop-preload/surface-registry";

const SURFACE_SHORTCUTS = desktopSurfaceRegistry.flatMap((surface) =>
  surface.shortcut !== null
    ? [{ digit: surface.shortcut, label: surface.label }]
    : [],
);

const sendShellCommand = (command: DesktopShellCommand): void => {
  const window = BrowserWindow.getFocusedWindow();
  if (window === null || window.isDestroyed()) return;
  window.webContents.send(DESKTOP_CHANNELS.shellCommand, command);
};

export const installApplicationMenu = (): void => {
  const onMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(onMac
      ? [
          {
            label: "Constellation",
            submenu: [
              { role: "about", label: "About Constellation" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide", label: "Hide Constellation" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit", label: "Quit Constellation" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Quick Capture…",
          accelerator: "CmdOrCtrl+Shift+K",
          click: () => sendShellCommand({ kind: "open-capture" }),
        },
        { type: "separator" },
        {
          label: "Close tab",
          accelerator: "CmdOrCtrl+W",
          click: () => sendShellCommand({ kind: "close-tab" }),
        },
        {
          label: "Close window",
          accelerator: "CmdOrCtrl+Shift+W",
          click: () => BrowserWindow.getFocusedWindow()?.close(),
        },
        ...(onMac
          ? []
          : ([
              { type: "separator" },
              { role: "quit", label: "Quit" },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo", label: "Undo" },
        { role: "redo", label: "Redo" },
        { type: "separator" },
        { role: "cut", label: "Cut" },
        { role: "copy", label: "Copy" },
        { role: "paste", label: "Paste" },
        { role: "selectAll", label: "Select all" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "Reload" },
        { role: "toggleDevTools", label: "Developer tools" },
        { type: "separator" },
        { role: "resetZoom", label: "Actual size" },
        { role: "zoomIn", label: "Zoom in" },
        { role: "zoomOut", label: "Zoom out" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Full screen" },
      ],
    },
    {
      label: "Go",
      submenu: [
        {
          label: "Command palette…",
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
    { role: "windowMenu", label: "Window" },
    {
      role: "help",
      label: "Help",
      submenu: [
        {
          label: "Keyboard shortcuts",
          accelerator: "CmdOrCtrl+/",
          click: () => sendShellCommand({ kind: "open-shortcuts" }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
