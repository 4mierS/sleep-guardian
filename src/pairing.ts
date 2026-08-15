import { config } from "./config";

export interface PairingCode {
  code: string;
  expiresAt: number; // ms-Zeitstempel
}

/**
 * Fordert bei der Control-Plane einen Einmal-Code an. Der PC weist sich dabei
 * mit seinem Agent-Token aus — deshalb kann nur jemand koppeln, der physisch
 * an diesem Rechner sitzt.
 */
export async function requestPairingCode(): Promise<PairingCode> {
  const res = await fetch(`${config.controlPlaneUrl}/api/agent/pairing-code`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.agentToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Server antwortete mit ${res.status}`);
  }

  const data = (await res.json()) as { code: string; expiresAt: string };
  return { code: data.code, expiresAt: new Date(data.expiresAt).getTime() };
}

/** Der Notaus: wirft alle Handys raus, die diesen PC steuern dürfen. */
export async function revokeAllDevices(): Promise<number> {
  const res = await fetch(`${config.controlPlaneUrl}/api/agent/revoke-devices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.agentToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Server antwortete mit ${res.status}`);
  }

  const data = (await res.json()) as { revoked: number };
  return data.revoked;
}

/** Die URL, die im QR-Code steckt. */
export function pairingUrl(code: string): string {
  // Der Code steht im Fragment, nicht in der Query: Browser schicken
  // Fragmente nie an den Server, er landet also in keinem Access-Log
  // und in keinem Referrer.
  return `${config.controlPlaneUrl}/pair#${code}`;
}
