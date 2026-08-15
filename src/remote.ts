import { config } from "./config";
import type { StatusSnapshot } from "./state";

/** Befehle, die vom Handy über die Control-Plane kommen können. */
export type RemoteCommand =
  | { type: "sleep-now" }
  | { type: "lock" }
  | { type: "cancel" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "extend"; minutes: number }
  | { type: "set-action"; action: "sleep" | "shutdown" };

type CommandHandler = (cmd: RemoteCommand) => void;

/**
 * Hält die Verbindung zur Control-Plane auf dem Hetzner-Server.
 *
 * Wichtig: der PC baut die Verbindung IMMER selbst nach außen auf (Outbound).
 * Dadurch brauchst du keine Portfreigabe im Router, kein DynDNS und kein VPN
 * — das Handy redet nur mit dem Server, nie direkt mit dem PC.
 */
export class RemoteControl {
  private timer: NodeJS.Timeout | null = null;
  private handler: CommandHandler | null = null;
  private lastSnapshot: StatusSnapshot | null = null;
  private consecutiveFailures = 0;

  get enabled() {
    return Boolean(config.controlPlaneUrl && config.agentToken);
  }

  onCommand(fn: CommandHandler) {
    this.handler = fn;
  }

  /** Wird von der Guardian-Statemachine bei jeder Änderung aufgerufen. */
  updateSnapshot(snapshot: StatusSnapshot) {
    this.lastSnapshot = snapshot;
  }

  start() {
    if (!this.enabled) {
      console.log("[remote] Keine Control-Plane konfiguriert – Fernsteuerung aus.");
      return;
    }
    this.beat();
    this.timer = setInterval(() => this.beat(), config.heartbeatIntervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async beat() {
    const snapshot = this.lastSnapshot;

    try {
      const res = await fetch(`${config.controlPlaneUrl}/api/agent/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.agentToken}`,
        },
        body: JSON.stringify({
          name: config.agentName,
          state: snapshot?.state ?? "active",
          reasons: snapshot?.reasons ?? [],
          msUntilSleep: snapshot?.msUntilSleep ?? null,
          action: config.action,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        this.noteFailure(`HTTP ${res.status}`);
        return;
      }

      this.consecutiveFailures = 0;
      const data = (await res.json()) as { commands?: RemoteCommand[] };

      for (const cmd of data.commands ?? []) {
        console.log("[remote] Befehl empfangen:", cmd.type);
        this.handler?.(cmd);
      }
    } catch (err) {
      this.noteFailure(String(err));
    }
  }

  private noteFailure(reason: string) {
    this.consecutiveFailures++;
    // Nicht bei jedem Tick spammen – nur beim ersten Fehler und dann selten.
    if (this.consecutiveFailures === 1 || this.consecutiveFailures % 12 === 0) {
      console.error(
        `[remote] Heartbeat fehlgeschlagen (${this.consecutiveFailures}x): ${reason}`
      );
    }
  }
}
