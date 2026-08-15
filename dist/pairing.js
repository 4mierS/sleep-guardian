"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestPairingCode = requestPairingCode;
exports.revokeAllDevices = revokeAllDevices;
exports.pairingUrl = pairingUrl;
const config_1 = require("./config");
/**
 * Fordert bei der Control-Plane einen Einmal-Code an. Der PC weist sich dabei
 * mit seinem Agent-Token aus — deshalb kann nur jemand koppeln, der physisch
 * an diesem Rechner sitzt.
 */
async function requestPairingCode() {
    const res = await fetch(`${config_1.config.controlPlaneUrl}/api/agent/pairing-code`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config_1.config.agentToken}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
        throw new Error(`Server antwortete mit ${res.status}`);
    }
    const data = (await res.json());
    return { code: data.code, expiresAt: new Date(data.expiresAt).getTime() };
}
/** Der Notaus: wirft alle Handys raus, die diesen PC steuern dürfen. */
async function revokeAllDevices() {
    const res = await fetch(`${config_1.config.controlPlaneUrl}/api/agent/revoke-devices`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config_1.config.agentToken}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
        throw new Error(`Server antwortete mit ${res.status}`);
    }
    const data = (await res.json());
    return data.revoked;
}
/** Die URL, die im QR-Code steckt. */
function pairingUrl(code) {
    // Der Code steht im Fragment, nicht in der Query: Browser schicken
    // Fragmente nie an den Server, er landet also in keinem Access-Log
    // und in keinem Referrer.
    return `${config_1.config.controlPlaneUrl}/pair#${code}`;
}
