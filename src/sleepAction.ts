import { execFile } from "child_process";
import { config } from "./config";

/**
 * Sperrt den Bildschirm. Bewusst getrennt von triggerSleepOrShutdown: der PC
 * bleibt wach, der Zustand der Statemachine bleibt unberührt.
 */
export function lockWorkstation() {
  execFile("rundll32.exe", ["user32.dll,LockWorkStation"], (err) => {
    if (err) console.error("[power] Sperren fehlgeschlagen:", err);
  });
}

/** Löst den konfigurierten Sleep- oder Shutdown-Befehl aus. */
export function triggerSleepOrShutdown() {
  if (config.action === "shutdown") {
    // /s = shutdown, /t 0 = sofort
    execFile("shutdown.exe", ["/s", "/t", "0"], (err) => {
      if (err) console.error("[power] Shutdown fehlgeschlagen:", err);
    });
  } else {
    // SetSuspendState(hibernate=0, forceCritical=1, disableWakeEvent=0)
    execFile(
      "rundll32.exe",
      ["powrprof.dll,SetSuspendState", "0,1,0"],
      (err) => {
        if (err) console.error("[power] Sleep fehlgeschlagen:", err);
      }
    );
  }
}
