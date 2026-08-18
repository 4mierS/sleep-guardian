import { config } from "./config";
import { isNetworkDownloadActive } from "./monitors/network";
import { isSteamDownloadActive } from "./monitors/steam";
import { isClaudeSessionActive } from "./monitors/claudeSessions";
import { isUserPresent } from "./monitors/presence";
import { isMediaPlaying } from "./monitors/media";
import { triggerSleepOrShutdown } from "./sleepAction";

export type AppState = "active" | "idle-counting" | "cancel-window" | "sleeping";

export interface StatusSnapshot {
  state: AppState;
  reasons: string[]; // welche Signale gerade "aktiv" sind
  msUntilSleep: number | null; // null wenn state === "active"
}

type Listener = (snapshot: StatusSnapshot) => void;

export class Guardian {
  private state: AppState = "active";
  private idleSince: number | null = null;
  private cancelDeadline: number | null = null;
  private listeners: Listener[] = [];
  private paused = false;
  private timer: NodeJS.Timeout | null = null;

  onUpdate(fn: Listener) {
    this.listeners.push(fn);
  }

  start() {
    this.tick(); // sofort einmal prüfen
    this.timer = setInterval(() => this.tick(), config.pollIntervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) {
      this.state = "active";
      this.idleSince = null;
      this.cancelDeadline = null;
      this.emit([]);
    }
  }

  isPaused() {
    return this.paused;
  }

  /** Bricht einen laufenden Countdown ab (z.B. per Notification-Klick). */
  cancelCountdown() {
    if (this.state === "idle-counting" || this.state === "cancel-window") {
      this.state = "active";
      this.idleSince = null;
      this.cancelDeadline = null;
      this.emit(["manuell abgebrochen"]);
    }
  }

  /**
   * Nach dem Aufwachen aus Sleep/Hibernate: der Node-Prozess läuft einfach
   * weiter und würde mit den alten (längst abgelaufenen) idleSince-/
   * cancelDeadline-Zeitstempeln sofort wieder in den Sleep-Zweig laufen.
   * Ohne diesen Reset legt sich der PC direkt nach dem Einschalten erneut
   * schlafen.
   */
  notifySystemResume() {
    this.state = "active";
    this.idleSince = null;
    this.cancelDeadline = null;
    this.emit(["gerade aufgewacht"]);
  }

  /** Sofort schlafen legen / herunterfahren – egal was gerade läuft. */
  sleepNow() {
    this.state = "sleeping";
    this.emit(["vom Handy ausgelöst"]);
    triggerSleepOrShutdown();
  }

  /**
   * Verschiebt den Countdown um N Minuten nach hinten ("Snooze").
   * Praktisch, wenn du unterwegs merkst: doch noch was am Laufen lassen.
   */
  extendBy(minutes: number) {
    const ms = minutes * 60_000;
    if (this.idleSince !== null) {
      this.idleSince += ms;
    }
    if (this.cancelDeadline !== null) {
      this.cancelDeadline += ms;
    }
    // Aus dem letzten Warnfenster zurück in den normalen Countdown
    if (this.state === "cancel-window") {
      this.state = "idle-counting";
    }
    this.emit([`+${minutes} min verlängert`]);
  }

  /** Umschalten zwischen Energiesparmodus und Herunterfahren. */
  setAction(action: "sleep" | "shutdown") {
    config.action = action;
    this.emit(this.state === "active" ? [] : [`Aktion: ${action}`]);
  }

  getState(): AppState {
    return this.state;
  }

  private async tick() {
    if (this.paused) return;

    const [network, steam, claude, media] = await Promise.all([
      isNetworkDownloadActive(),
      isSteamDownloadActive(),
      isClaudeSessionActive(),
      isMediaPlaying(),
    ]);

    // Synchron und billig, deshalb außerhalb des Promise.all.
    const present = isUserPresent();

    const reasons: string[] = [];
    if (present) reasons.push("Nutzer aktiv");
    if (steam) reasons.push("Steam-Download läuft");
    else if (network) reasons.push("Netzwerk-Download aktiv");
    if (claude) reasons.push("Claude Code Session aktiv");
    if (media) reasons.push("Medienwiedergabe läuft");

    const anythingActive = reasons.length > 0;
    const now = Date.now();

    if (anythingActive) {
      this.state = "active";
      this.idleSince = null;
      this.cancelDeadline = null;
      this.emit(reasons);
      return;
    }

    // Nichts Wichtiges läuft mehr
    if (this.idleSince === null) {
      this.idleSince = now;
    }

    const idleFor = now - this.idleSince;

    if (idleFor < config.idleThresholdMs - config.cancelWindowMs) {
      this.state = "idle-counting";
      this.emit(reasons);
      return;
    }

    if (idleFor < config.idleThresholdMs) {
      if (this.state !== "cancel-window") {
        this.state = "cancel-window";
        this.cancelDeadline = this.idleSince + config.idleThresholdMs;
        this.emit(reasons, true); // true = "gerade in cancel-window eingetreten"
      } else {
        this.emit(reasons);
      }
      return;
    }

    // Zeit abgelaufen -> handeln
    this.state = "sleeping";
    this.emit(reasons);
    triggerSleepOrShutdown();
  }

  private emit(reasons: string[], justEnteredCancelWindow = false) {
    const msUntilSleep =
      this.state === "active"
        ? null
        : this.cancelDeadline
        ? Math.max(0, this.cancelDeadline - Date.now())
        : this.idleSince
        ? Math.max(0, config.idleThresholdMs - (Date.now() - this.idleSince))
        : null;

    const snapshot: StatusSnapshot = { state: this.state, reasons, msUntilSleep };
    for (const l of this.listeners) l(snapshot);
    if (justEnteredCancelWindow) {
      // Extra-Flag könnte hier für eine System-Notification genutzt werden;
      // main.ts hört ohnehin auf jede Änderung von msUntilSleep.
    }
  }
}
