import * as dotenv from "dotenv";
dotenv.config();

import { app, Tray, Menu, nativeImage, Notification, dialog, powerMonitor } from "electron";
import { Guardian, StatusSnapshot } from "./state";
import { RemoteControl, RemoteCommand } from "./remote";
import { lockWorkstation } from "./sleepAction";
import { showPairingWindow } from "./pairWindow";
import { revokeAllDevices } from "./pairing";
import { ICON_IDLE, ICON_ACTIVE, ICON_COUNTDOWN, ICON_SLEEPING } from "./icons";

// Läuft ohne Dock-Icon / Fenster, nur Tray
app.dock?.hide();

let tray: Tray | null = null;
const guardian = new Guardian();
const remote = new RemoteControl();
let lastNotifiedCancelWindow = false;

/** Übersetzt einen vom Handy geschickten Befehl in eine Guardian-Aktion. */
function applyRemoteCommand(cmd: RemoteCommand) {
  switch (cmd.type) {
    case "sleep-now":
      guardian.sleepNow();
      break;
    case "lock":
      // Am Guardian vorbei: Sperren ändert weder Zustand noch Countdown.
      lockWorkstation();
      break;
    case "cancel":
      guardian.cancelCountdown();
      break;
    case "pause":
      guardian.setPaused(true);
      break;
    case "resume":
      guardian.setPaused(false);
      break;
    case "extend":
      guardian.extendBy(cmd.minutes);
      break;
    case "set-action":
      guardian.setAction(cmd.action);
      break;
  }
  refreshTray();
}

function iconFor(state: StatusSnapshot["state"]) {
  switch (state) {
    case "active":
      return nativeImage.createFromDataURL(ICON_ACTIVE);
    case "idle-counting":
      return nativeImage.createFromDataURL(ICON_IDLE);
    case "cancel-window":
      return nativeImage.createFromDataURL(ICON_COUNTDOWN);
    case "sleeping":
      return nativeImage.createFromDataURL(ICON_SLEEPING);
  }
}

function formatMs(ms: number) {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function buildMenu() {
  const snapshot = lastSnapshot;
  const statusLabel = snapshot
    ? snapshot.reasons.length > 0
      ? `Aktiv: ${snapshot.reasons.join(", ")}`
      : snapshot.msUntilSleep !== null
      ? `Idle – Sleep in ${formatMs(snapshot.msUntilSleep)}`
      : "Aktiv"
    : "Starte...";

  return Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: "separator" },
    {
      label: guardian.isPaused() ? "Monitoring fortsetzen" : "Monitoring pausieren",
      click: () => {
        guardian.setPaused(!guardian.isPaused());
        refreshTray();
      },
    },
    {
      label: "Countdown abbrechen",
      enabled: snapshot?.state === "idle-counting" || snapshot?.state === "cancel-window",
      click: () => guardian.cancelCountdown(),
    },
    { label: "Bildschirm sperren", click: () => lockWorkstation() },
    { type: "separator" },
    {
      label: "Handy koppeln",
      enabled: remote.enabled,
      click: () => void pairPhone(),
    },
    {
      label: "Alle Handys abmelden",
      enabled: remote.enabled,
      click: () => void revokeAllPhones(),
    },
    { type: "separator" },
    { label: "Beenden", click: () => app.quit() },
  ]);
}

/** Holt einen Einmal-Code und zeigt ihn als QR. */
async function pairPhone() {
  try {
    await showPairingWindow();
  } catch (err) {
    dialog.showErrorBox(
      "Koppeln nicht möglich",
      `Die Control-Plane hat den Pairing-Code nicht geliefert.\n\n${String(err)}`
    );
  }
}

/**
 * Notaus. Bewusst mit Rückfrage: danach kommt kein Handy mehr an diesen PC,
 * bis wieder jemand physisch davorsitzt und neu koppelt.
 */
async function revokeAllPhones() {
  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Abbrechen", "Alle abmelden"],
    defaultId: 0,
    cancelId: 0,
    title: "Alle Handys abmelden",
    message: "Alle gekoppelten Handys abmelden?",
    detail:
      "Danach kann kein Handy diesen PC mehr fernsteuern. Zum Wiederherstellen musst du hier am Rechner neu koppeln.",
  });

  if (response !== 1) return;

  try {
    const count = await revokeAllDevices();
    new Notification({
      title: "Handys abgemeldet",
      body:
        count === 0
          ? "Es war kein Gerät gekoppelt."
          : `${count} Gerät(e) haben den Zugriff verloren.`,
    }).show();
  } catch (err) {
    dialog.showErrorBox(
      "Abmelden fehlgeschlagen",
      `Die Control-Plane war nicht erreichbar.\n\n${String(err)}`
    );
  }
}

let lastSnapshot: StatusSnapshot | null = null;

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(buildMenu());
}

function handleSnapshot(snapshot: StatusSnapshot) {
  lastSnapshot = snapshot;
  remote.updateSnapshot(snapshot);
  if (!tray) return;

  tray.setImage(iconFor(snapshot.state));

  const tooltip =
    snapshot.reasons.length > 0
      ? `Sleep Guardian – aktiv (${snapshot.reasons.join(", ")})`
      : snapshot.msUntilSleep !== null
      ? `Sleep Guardian – Sleep in ${formatMs(snapshot.msUntilSleep)}`
      : "Sleep Guardian – aktiv";
  tray.setToolTip(tooltip);

  if (snapshot.state === "cancel-window" && !lastNotifiedCancelWindow) {
    lastNotifiedCancelWindow = true;
    const n = new Notification({
      title: "PC geht gleich schlafen",
      body: "Keine aktiven Downloads oder Claude-Sessions mehr erkannt. Klicken zum Abbrechen.",
    });
    n.on("click", () => guardian.cancelCountdown());
    n.show();
  }
  if (snapshot.state !== "cancel-window") {
    lastNotifiedCancelWindow = false;
  }

  refreshTray();
}

app.whenReady().then(() => {
  tray = new Tray(iconFor("active"));
  tray.setToolTip("Sleep Guardian");
  tray.setContextMenu(buildMenu());

  guardian.onUpdate(handleSnapshot);
  guardian.start();

  // Nach Sleep/Hibernate läuft der Prozess mit veralteten Idle-Zeitstempeln
  // weiter und würde sonst sofort wieder schlafen legen.
  powerMonitor.on("resume", () => guardian.notifySystemResume());

  remote.onCommand(applyRemoteCommand);
  remote.start();
});

app.on("before-quit", () => {
  guardian.stop();
  remote.stop();
});

// Tray-Apps sollen nicht beenden, wenn alle Fenster zu sind (es gibt eh keine)
app.on("window-all-closed", () => {
  /* Tray-App ohne Fenster soll trotzdem weiterlaufen */
});
