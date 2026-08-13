"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteControl = void 0;
const config_1 = require("./config");
/**
 * Hält die Verbindung zur Control-Plane auf dem Hetzner-Server.
 *
 * Wichtig: der PC baut die Verbindung IMMER selbst nach außen auf (Outbound).
 * Dadurch brauchst du keine Portfreigabe im Router, kein DynDNS und kein VPN
 * — das Handy redet nur mit dem Server, nie direkt mit dem PC.
 */
class RemoteControl {
    constructor() {
        this.timer = null;
        this.handler = null;
        this.lastSnapshot = null;
        this.consecutiveFailures = 0;
    }
    get enabled() {
        return Boolean(config_1.config.controlPlaneUrl && config_1.config.agentToken);
    }
    onCommand(fn) {
        this.handler = fn;
    }
    /** Wird von der Guardian-Statemachine bei jeder Änderung aufgerufen. */
    updateSnapshot(snapshot) {
        this.lastSnapshot = snapshot;
    }
    start() {
        if (!this.enabled) {
            console.log("[remote] Keine Control-Plane konfiguriert – Fernsteuerung aus.");
            return;
        }
        this.beat();
        this.timer = setInterval(() => this.beat(), config_1.config.heartbeatIntervalMs);
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
    }
    async beat() {
        const snapshot = this.lastSnapshot;
        try {
            const res = await fetch(`${config_1.config.controlPlaneUrl}/api/agent/heartbeat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${config_1.config.agentToken}`,
                },
                body: JSON.stringify({
                    name: config_1.config.agentName,
                    state: snapshot?.state ?? "active",
                    reasons: snapshot?.reasons ?? [],
                    msUntilSleep: snapshot?.msUntilSleep ?? null,
                    action: config_1.config.action,
                }),
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) {
                this.noteFailure(`HTTP ${res.status}`);
                return;
            }
            this.consecutiveFailures = 0;
            const data = (await res.json());
            for (const cmd of data.commands ?? []) {
                console.log("[remote] Befehl empfangen:", cmd.type);
                this.handler?.(cmd);
            }
        }
        catch (err) {
            this.noteFailure(String(err));
        }
    }
    noteFailure(reason) {
        this.consecutiveFailures++;
        // Nicht bei jedem Tick spammen – nur beim ersten Fehler und dann selten.
        if (this.consecutiveFailures === 1 || this.consecutiveFailures % 12 === 0) {
            console.error(`[remote] Heartbeat fehlgeschlagen (${this.consecutiveFailures}x): ${reason}`);
        }
    }
}
exports.RemoteControl = RemoteControl;
