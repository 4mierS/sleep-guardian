"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const electron_1 = require("electron");
const state_1 = require("./state");
const remote_1 = require("./remote");
const sleepAction_1 = require("./sleepAction");
const pairWindow_1 = require("./pairWindow");
const pairing_1 = require("./pairing");
const icons_1 = require("./icons");
// Läuft ohne Dock-Icon / Fenster, nur Tray
electron_1.app.dock?.hide();
let tray = null;
const guardian = new state_1.Guardian();
const remote = new remote_1.RemoteControl();
let lastNotifiedCancelWindow = false;
/** Übersetzt einen vom Handy geschickten Befehl in eine Guardian-Aktion. */
function applyRemoteCommand(cmd) {
    switch (cmd.type) {
        case "sleep-now":
            guardian.sleepNow();
            break;
        case "lock":
            // Am Guardian vorbei: Sperren ändert weder Zustand noch Countdown.
            (0, sleepAction_1.lockWorkstation)();
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
function iconFor(state) {
    switch (state) {
        case "active":
            return electron_1.nativeImage.createFromDataURL(icons_1.ICON_ACTIVE);
        case "idle-counting":
            return electron_1.nativeImage.createFromDataURL(icons_1.ICON_IDLE);
        case "cancel-window":
            return electron_1.nativeImage.createFromDataURL(icons_1.ICON_COUNTDOWN);
        case "sleeping":
            return electron_1.nativeImage.createFromDataURL(icons_1.ICON_SLEEPING);
    }
}
function formatMs(ms) {
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
    return electron_1.Menu.buildFromTemplate([
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
        { label: "Bildschirm sperren", click: () => (0, sleepAction_1.lockWorkstation)() },
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
        { label: "Beenden", click: () => electron_1.app.quit() },
    ]);
}
/** Holt einen Einmal-Code und zeigt ihn als QR. */
async function pairPhone() {
    try {
        await (0, pairWindow_1.showPairingWindow)();
    }
    catch (err) {
        electron_1.dialog.showErrorBox("Koppeln nicht möglich", `Die Control-Plane hat den Pairing-Code nicht geliefert.\n\n${String(err)}`);
    }
}
/**
 * Notaus. Bewusst mit Rückfrage: danach kommt kein Handy mehr an diesen PC,
 * bis wieder jemand physisch davorsitzt und neu koppelt.
 */
async function revokeAllPhones() {
    const { response } = await electron_1.dialog.showMessageBox({
        type: "warning",
        buttons: ["Abbrechen", "Alle abmelden"],
        defaultId: 0,
        cancelId: 0,
        title: "Alle Handys abmelden",
        message: "Alle gekoppelten Handys abmelden?",
        detail: "Danach kann kein Handy diesen PC mehr fernsteuern. Zum Wiederherstellen musst du hier am Rechner neu koppeln.",
    });
    if (response !== 1)
        return;
    try {
        const count = await (0, pairing_1.revokeAllDevices)();
        new electron_1.Notification({
            title: "Handys abgemeldet",
            body: count === 0
                ? "Es war kein Gerät gekoppelt."
                : `${count} Gerät(e) haben den Zugriff verloren.`,
        }).show();
    }
    catch (err) {
        electron_1.dialog.showErrorBox("Abmelden fehlgeschlagen", `Die Control-Plane war nicht erreichbar.\n\n${String(err)}`);
    }
}
let lastSnapshot = null;
function refreshTray() {
    if (!tray)
        return;
    tray.setContextMenu(buildMenu());
}
function handleSnapshot(snapshot) {
    lastSnapshot = snapshot;
    remote.updateSnapshot(snapshot);
    if (!tray)
        return;
    tray.setImage(iconFor(snapshot.state));
    const tooltip = snapshot.reasons.length > 0
        ? `Sleep Guardian – aktiv (${snapshot.reasons.join(", ")})`
        : snapshot.msUntilSleep !== null
            ? `Sleep Guardian – Sleep in ${formatMs(snapshot.msUntilSleep)}`
            : "Sleep Guardian – aktiv";
    tray.setToolTip(tooltip);
    if (snapshot.state === "cancel-window" && !lastNotifiedCancelWindow) {
        lastNotifiedCancelWindow = true;
        const n = new electron_1.Notification({
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
electron_1.app.whenReady().then(() => {
    tray = new electron_1.Tray(iconFor("active"));
    tray.setToolTip("Sleep Guardian");
    tray.setContextMenu(buildMenu());
    guardian.onUpdate(handleSnapshot);
    guardian.start();
    remote.onCommand(applyRemoteCommand);
    remote.start();
});
electron_1.app.on("before-quit", () => {
    guardian.stop();
    remote.stop();
});
// Tray-Apps sollen nicht beenden, wenn alle Fenster zu sind (es gibt eh keine)
electron_1.app.on("window-all-closed", () => {
    /* Tray-App ohne Fenster soll trotzdem weiterlaufen */
});
