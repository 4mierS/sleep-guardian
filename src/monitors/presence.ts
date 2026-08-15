import { powerMonitor } from "electron";
import { config } from "../config";

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
export function isUserPresent(): boolean {
  return powerMonitor.getSystemIdleTime() < config.presenceIdleThresholdSec;
}
