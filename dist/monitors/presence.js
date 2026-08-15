"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUserPresent = isUserPresent;
const electron_1 = require("electron");
const config_1 = require("../config");
/**
 * Sitzt gerade jemand am Rechner?
 *
 * Die anderen Monitore messen ausschließlich Maschinenaktivität (Downloads,
 * Remote-Sessions). Ohne dieses Signal hält die Statemachine einen Rechner,
 * an dem aktiv gearbeitet wird, für untätig und legt ihn schlafen.
 *
 * powerMonitor.getSystemIdleTime() liefert die Sekunden seit der letzten
 * Tastatur- oder Mauseingabe — synchron und ohne natives Modul, weil Electron
 * die Win32-Abfrage selbst mitbringt.
 */
function isUserPresent() {
    return electron_1.powerMonitor.getSystemIdleTime() < config_1.config.presenceIdleThresholdSec;
}
