"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
/**
 * Zentrale Konfiguration. Alles per ENV überschreibbar, damit du keine
 * Secrets (API-Keys) im Code hast.
 */
exports.config = {
    // Wie oft wird der Status insgesamt geprüft (ms)
    pollIntervalMs: numEnv("POLL_INTERVAL_MS", 30_000),
    // Wie lange NACH dem letzten "aktiv"-Signal gewartet wird, bevor
    // der PC schlafen/herunterfahren soll (ms). Standard: 10 Minuten.
    idleThresholdMs: numEnv("IDLE_THRESHOLD_MS", 10 * 60_000),
    // Countdown-Fenster kurz vor dem Sleep, in dem man per Klick
    // auf die Benachrichtigung abbrechen kann (ms).
    cancelWindowMs: numEnv("CANCEL_WINDOW_MS", 60_000),
    // "sleep" (Energiesparmodus) oder "shutdown" (herunterfahren)
    action: process.env.SLEEP_ACTION ?? "sleep",
    // --- Anwesenheit ---
    // Wie lange ohne Tastatur-/Mauseingabe, bis wir dich als "weg" annehmen (s).
    // Erst danach beginnt der idleThresholdMs-Countdown zu laufen — die
    // Gesamtzeit bis zur Aktion ist also die Summe aus beiden Werten.
    presenceIdleThresholdSec: numEnv("PRESENCE_IDLE_THRESHOLD_SEC", 300),
    // --- Netzwerk / Steam ---
    // Download-Rate (Bytes/s), ab der wir "aktiver Download" annehmen.
    // 1.5 MB/s als Default; bei dir eher niedriger ansetzen, wenn Steam
    // langsam lädt.
    networkActiveThresholdBytesPerSec: numEnv("NETWORK_THRESHOLD_BYTES_PER_SEC", 1_500_000),
    steamProcessNames: (process.env.STEAM_PROCESS_NAMES ?? "steam.exe,steamwebhelper.exe")
        .split(",")
        .map((s) => s.trim()),
    // --- Claude Code Sessions (Hetzner) ---
    // Endpoint auf deinem Orchestrator, der aktive Sessions/Tasks liefert.
    // Erwartetes JSON: { "activeCount": number } ODER { "sessions": [...] }
    claudeSessionsApiUrl: process.env.CLAUDE_SESSIONS_API_URL ?? "",
    claudeSessionsApiToken: process.env.CLAUDE_SESSIONS_API_TOKEN ?? "",
    // Falls die Remote-API mal nicht erreichbar ist: lieber "aktiv" annehmen
    // (fail-safe = PC bleibt an) statt fälschlich schlafen zu legen.
    failSafeOnApiError: true,
    // --- Fernsteuerung vom Handy (via Hetzner-Control-Plane) ---
    // Basis-URL deiner Control-Plane, z.B. https://guardian.deinedomain.de
    controlPlaneUrl: process.env.CONTROL_PLANE_URL ?? "",
    // Token, mit dem sich DIESER PC beim Server ausweist. Pro Maschine eigener
    // Token. Muss mit dem Wert in der DB übereinstimmen.
    agentToken: process.env.AGENT_TOKEN ?? "",
    // Anzeigename dieser Maschine in der Handy-App
    agentName: process.env.AGENT_NAME ?? "Desktop",
    // Wie oft der Agent beim Server nachfragt (Status melden + Befehle abholen).
    // Bestimmt die Latenz der Handy-Steuerung: 5s = Button-Druck wirkt nach max 5s.
    // Läuft unverändert als Fail-safe weiter, auch wenn der WebSocket-Push unten
    // aktiv ist – falls die Control-Plane (noch) keinen WS-Endpoint hat oder die
    // Verbindung mal wegbricht, bleibt die Fernsteuerung trotzdem funktionsfähig.
    heartbeatIntervalMs: numEnv("HEARTBEAT_INTERVAL_MS", 5_000),
    // Pfad des WebSocket-Endpoints auf der Control-Plane, relativ zu
    // controlPlaneUrl (http(s) wird automatisch zu ws(s)). Darüber werden
    // Snapshots sofort statt erst beim nächsten Heartbeat gepusht, und Befehle
    // vom Handy kommen ohne Poll-Latenz an.
    controlPlaneWsPath: process.env.CONTROL_PLANE_WS_PATH ?? "/api/agent/ws",
};
function numEnv(name, fallback) {
    const v = process.env[name];
    if (!v)
        return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
