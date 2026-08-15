"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lockWorkstation = lockWorkstation;
exports.triggerSleepOrShutdown = triggerSleepOrShutdown;
const child_process_1 = require("child_process");
const config_1 = require("./config");
/**
 * Sperrt den Bildschirm. Bewusst getrennt von triggerSleepOrShutdown: der PC
 * bleibt wach, der Zustand der Statemachine bleibt unberührt.
 */
function lockWorkstation() {
    (0, child_process_1.execFile)("rundll32.exe", ["user32.dll,LockWorkStation"], (err) => {
        if (err)
            console.error("[power] Sperren fehlgeschlagen:", err);
    });
}
/** Löst den konfigurierten Sleep- oder Shutdown-Befehl aus. */
function triggerSleepOrShutdown() {
    if (config_1.config.action === "shutdown") {
        // /s = shutdown, /t 0 = sofort
        (0, child_process_1.execFile)("shutdown.exe", ["/s", "/t", "0"], (err) => {
            if (err)
                console.error("[power] Shutdown fehlgeschlagen:", err);
        });
    }
    else {
        // SetSuspendState(hibernate=0, forceCritical=1, disableWakeEvent=0)
        (0, child_process_1.execFile)("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"], (err) => {
            if (err)
                console.error("[power] Sleep fehlgeschlagen:", err);
        });
    }
}
