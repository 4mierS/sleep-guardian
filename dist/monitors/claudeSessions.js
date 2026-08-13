"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isClaudeSessionActive = isClaudeSessionActive;
const config_1 = require("../config");
/**
 * Erwartet auf deinem Orchestrator (Hetzner) einen Endpoint, der etwa
 * so etwas zurückgibt:
 *   { "activeCount": 2 }
 * oder
 *   { "sessions": [{ "id": "...", "status": "running" }, ...] }
 *
 * Passe die Auswertung unten an dein tatsächliches Response-Format an,
 * sobald der Endpoint steht.
 */
async function isClaudeSessionActive() {
    if (!config_1.config.claudeSessionsApiUrl) {
        // Kein Endpoint konfiguriert -> Signal einfach ignorieren.
        return false;
    }
    try {
        const res = await fetch(config_1.config.claudeSessionsApiUrl, {
            headers: config_1.config.claudeSessionsApiToken
                ? { Authorization: `Bearer ${config_1.config.claudeSessionsApiToken}` }
                : {},
            signal: AbortSignal.timeout(5_000),
        });
        if (!res.ok) {
            console.error(`[claude] API antwortete mit ${res.status}`);
            return config_1.config.failSafeOnApiError;
        }
        const data = (await res.json());
        if ("activeCount" in data && typeof data.activeCount === "number") {
            return data.activeCount > 0;
        }
        if ("sessions" in data && Array.isArray(data.sessions)) {
            return data.sessions.some((s) => s.status === "running" || s.status === "active");
        }
        return false;
    }
    catch (err) {
        console.error("[claude] Konnte Session-Status nicht abrufen:", err);
        return config_1.config.failSafeOnApiError;
    }
}
