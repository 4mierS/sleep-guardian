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
exports.isSteamDownloadActive = isSteamDownloadActive;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const config_1 = require("../config");
const network_1 = require("./network");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/** Prüft per tasklist, ob einer der Steam-Prozesse läuft. */
async function isSteamRunning() {
    try {
        const { stdout } = await execFileAsync("tasklist.exe", ["/FO", "CSV", "/NH"]);
        const lower = stdout.toLowerCase();
        return config_1.config.steamProcessNames.some((name) => lower.includes(name.toLowerCase()));
    }
    catch (err) {
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
function findSteamContentLog() {
    const steamPath = process.env.STEAM_PATH ?? "C:\\Program Files (x86)\\Steam";
    const logPath = path.join(steamPath, "logs", "content_log.txt");
    return fs.existsSync(logPath) ? logPath : null;
}
async function isSteamLogShowingRecentDownload() {
    const logPath = findSteamContentLog();
    if (!logPath)
        return false;
    try {
        const stat = fs.statSync(logPath);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 2 * 60_000)
            return false; // Log seit > 2min nicht mehr angefasst
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
    }
    catch (err) {
        console.error("[steam] Log-Auswertung fehlgeschlagen:", err);
        return false;
    }
}
/**
 * Kombiniertes Signal: Steam läuft UND (Netzwerk-Rate über Schwelle ODER
 * Log deutet auf frischen Download hin).
 */
async function isSteamDownloadActive() {
    const running = await isSteamRunning();
    if (!running)
        return false;
    const [networkRate, logSaysDownloading] = await Promise.all([
        (0, network_1.getNetworkDownloadBytesPerSec)(),
        isSteamLogShowingRecentDownload(),
    ]);
    return networkRate >= config_1.config.networkActiveThresholdBytesPerSec || logSaysDownloading;
}
