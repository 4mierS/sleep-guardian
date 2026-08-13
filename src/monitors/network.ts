import { execFile } from "child_process";
import { promisify } from "util";
import { config } from "../config";

const execFileAsync = promisify(execFile);

/**
 * Liest die aktuelle Netzwerk-Empfangsrate (Bytes/s) über den Windows
 * Performance-Counter "Network Interface(*)\\Bytes Received/sec" aus.
 * Summiert über alle Adapter, damit egal ist ob LAN oder WLAN aktiv ist.
 */
export async function getNetworkDownloadBytesPerSec(): Promise<number> {
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
  } catch (err) {
    console.error("[network] Konnte Bytes/sec nicht lesen:", err);
    return 0;
  }
}

export async function isNetworkDownloadActive(): Promise<boolean> {
  const rate = await getNetworkDownloadBytesPerSec();
  return rate >= config.networkActiveThresholdBytesPerSec;
}
