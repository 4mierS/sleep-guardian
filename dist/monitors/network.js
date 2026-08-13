"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNetworkDownloadBytesPerSec = getNetworkDownloadBytesPerSec;
exports.isNetworkDownloadActive = isNetworkDownloadActive;
const child_process_1 = require("child_process");
const util_1 = require("util");
const config_1 = require("../config");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Liest die aktuelle Netzwerk-Empfangsrate (Bytes/s) über den Windows
 * Performance-Counter "Network Interface(*)\\Bytes Received/sec" aus.
 * Summiert über alle Adapter, damit egal ist ob LAN oder WLAN aktiv ist.
 */
async function getNetworkDownloadBytesPerSec() {
    const psScript = `
    (Get-Counter '\\Network Interface(*)\\Bytes Received/sec').CounterSamples |
      Where-Object { $_.InstanceName -notmatch 'isatap|Loopback|Teredo' } |
      Measure-Object -Property CookedValue -Sum |
      Select-Object -ExpandProperty Sum
  `;
    try {
        const { stdout } = await execFileAsync("powershell.exe", [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            psScript,
        ]);
        const value = parseFloat(stdout.trim());
        return Number.isFinite(value) ? value : 0;
    }
    catch (err) {
        console.error("[network] Konnte Bytes/sec nicht lesen:", err);
        return 0;
    }
}
async function isNetworkDownloadActive() {
    const rate = await getNetworkDownloadBytesPerSec();
    return rate >= config_1.config.networkActiveThresholdBytesPerSec;
}
