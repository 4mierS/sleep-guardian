"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoteControl = void 0;
const ws_1 = __importDefault(require("ws"));
const config_1 = require("./config");
const WS_RECONNECT_INITIAL_MS = 2_000;
const WS_RECONNECT_MAX_MS = 30_000;
/**
 * Hält die Verbindung zur Control-Plane auf dem Hetzner-Server.
 *
 * Wichtig: der PC baut die Verbindung IMMER selbst nach außen auf (Outbound).
 * Dadurch brauchst du keine Portfreigabe im Router, kein DynDNS und kein VPN
 * — das Handy redet nur mit dem Server, nie direkt mit dem PC. Das gilt auch
 * für den WebSocket unten: der Agent verbindet sich raus, es wird kein Port
 * am PC geöffnet.
 *
 * Zwei parallele Kanäle zum selben Zweck (Snapshot raus, Commands rein):
 * - Heartbeat-Poll (beat()): unverändertes Fail-safe, läuft immer.
 * - WebSocket (connectWs()): pusht/empfängt sofort statt erst beim nächsten
 *   Poll. Fällt die Verbindung weg oder unterstützt die Control-Plane den
 *   Endpoint (noch) nicht, läuft die Fernsteuerung einfach über den Poll
 *   weiter – der WS-Teil reconnectet im Hintergrund mit Backoff.
 */
class RemoteControl {
    constructor() {
        this.timer = null;
        this.handler = null;
        this.lastSnapshot = null;
        this.consecutiveFailures = 0;
        this.ws = null;
        this.wsConnected = false;
        this.wsReconnectTimer = null;
        this.wsReconnectDelayMs = WS_RECONNECT_INITIAL_MS;
        this.wsErrorLogged = false;
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
        this.sendSnapshotOverWs(snapshot);
    }
    start() {
        if (!this.enabled) {
            console.log("[remote] Keine Control-Plane konfiguriert – Fernsteuerung aus.");
            return;
        }
        this.beat();
        this.timer = setInterval(() => this.beat(), config_1.config.heartbeatIntervalMs);
        this.connectWs();
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        if (this.wsReconnectTimer)
            clearTimeout(this.wsReconnectTimer);
        this.wsReconnectTimer = null;
        this.ws?.close();
        this.ws = null;
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
    buildWsUrl() {
        const httpUrl = new URL(config_1.config.controlPlaneUrl);
        const wsProtocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
        return `${wsProtocol}//${httpUrl.host}${config_1.config.controlPlaneWsPath}`;
    }
    connectWs() {
        if (!this.enabled)
            return;
        let socket;
        try {
            socket = new ws_1.default(this.buildWsUrl(), {
                headers: { Authorization: `Bearer ${config_1.config.agentToken}` },
            });
        }
        catch (err) {
            console.error("[remote] WebSocket-Verbindung fehlgeschlagen:", err);
            this.scheduleWsReconnect();
            return;
        }
        this.ws = socket;
        socket.on("open", () => {
            this.wsConnected = true;
            this.wsErrorLogged = false;
            this.wsReconnectDelayMs = WS_RECONNECT_INITIAL_MS;
            console.log("[remote] WebSocket verbunden – Push statt Poll aktiv.");
            this.sendSnapshotOverWs(this.lastSnapshot);
        });
        socket.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                for (const cmd of msg.commands ?? []) {
                    console.log("[remote] Befehl per Push empfangen:", cmd.type);
                    this.handler?.(cmd);
                }
            }
            catch (err) {
                console.error("[remote] Ungültige WebSocket-Nachricht:", err);
            }
        });
        socket.on("close", () => {
            this.wsConnected = false;
            this.ws = null;
            this.scheduleWsReconnect();
        });
        socket.on("error", (err) => {
            // "close" folgt danach ohnehin und plant den Reconnect – hier nur
            // einmal loggen statt bei jedem Fehlversuch zu spammen.
            if (!this.wsErrorLogged) {
                console.error("[remote] WebSocket-Fehler, Fernsteuerung läuft über Heartbeat-Poll weiter:", String(err));
                this.wsErrorLogged = true;
            }
        });
    }
    scheduleWsReconnect() {
        if (this.wsReconnectTimer || !this.enabled)
            return;
        this.wsReconnectTimer = setTimeout(() => {
            this.wsReconnectTimer = null;
            this.connectWs();
        }, this.wsReconnectDelayMs);
        this.wsReconnectDelayMs = Math.min(this.wsReconnectDelayMs * 2, WS_RECONNECT_MAX_MS);
    }
    sendSnapshotOverWs(snapshot) {
        if (!this.ws || !this.wsConnected)
            return;
        this.ws.send(JSON.stringify({
            type: "snapshot",
            name: config_1.config.agentName,
            state: snapshot?.state ?? "active",
            reasons: snapshot?.reasons ?? [],
            msUntilSleep: snapshot?.msUntilSleep ?? null,
            action: config_1.config.action,
        }));
    }
}
exports.RemoteControl = RemoteControl;
