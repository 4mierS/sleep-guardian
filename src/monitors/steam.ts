import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { config } from "../config";
import { getNetworkDownloadBytesPerSec } from "./network";

const execFileAsync = promisify(execFile);

/** Prüft per tasklist, ob einer der Steam-Prozesse läuft. */
async function isSteamRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"]);
    const lower = stdout.toLowerCase();
    return config.steamProcessNames.some((name) => lower.includes(name.toLowerCase()));
  } catch (err) {
    console.error("[steam] tasklist fehlgeschlagen:", err);
    return false;
  }
}

/**
 * Optional: liest Steams content_log.txt und schaut, ob in den letzten
 * 2 Minuten ein "downloading"/"update" Eintrag geschrieben wurde. Das ist
 * präziser als reine Netzwerk-Rate (z.B. wenn du nebenbei Youtube schaust,
 * ist die Download-Rate auch hoch, aber Steam lädt evtl. gar nichts).
 * Pfad kann per STEAM_PATH ENV überschrieben werden, Default ist der
 * Standard-Installationsort.
 */
function findSteamContentLog(): string | null {
  const steamPath = process.env.STEAM_PATH ?? "C:\\Program Files (x86)\\Steam";
  const logPath = path.join(steamPath, "logs", "content_log.txt");
  return fs.existsSync(logPath) ? logPath : null;
}

async function isSteamLogShowingRecentDownload(): Promise<boolean> {
  const logPath = findSteamContentLog();
  if (!logPath) return false;

  try {
    const stat = fs.statSync(logPath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > 2 * 60_000) return false; // Log seit > 2min nicht mehr angefasst

    // Nur die letzten paar KB lesen, die Datei kann sehr groß werden
    const fd = fs.openSync(logPath, "r");
    const size = fs.fstatSync(fd).size;
    const readSize = Math.min(size, 8_000);
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, size - readSize);
    fs.closeSync(fd);

    const tail = buffer.toString("utf-8").toLowerCase();
    return /downloading|download.*complete|update.*state|scheduler/i.test(tail) &&
      !/fully installed/i.test(tail.split("\n").pop() ?? "");
  } catch (err) {
    console.error("[steam] Log-Auswertung fehlgeschlagen:", err);
    return false;
  }
}

/**
 * Kombiniertes Signal: Steam läuft UND (Netzwerk-Rate über Schwelle ODER
 * Log deutet auf frischen Download hin).
 */
export async function isSteamDownloadActive(): Promise<boolean> {
  const running = await isSteamRunning();
  if (!running) return false;

  const [networkRate, logSaysDownloading] = await Promise.all([
    getNetworkDownloadBytesPerSec(),
    isSteamLogShowingRecentDownload(),
  ]);

  return networkRate >= config.networkActiveThresholdBytesPerSec || logSaysDownloading;
}
