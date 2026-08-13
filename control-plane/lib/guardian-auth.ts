import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

/** Token -> SHA-256 Hex. Nur der Hash landet in der DB. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Liest den Bearer-Token aus dem Header und sucht die passende Maschine.
 * Gibt null zurück, wenn kein/ungültiger Token.
 */
export async function authenticateAgent(req: Request) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  return prisma.machine.findUnique({
    where: { tokenHash: hashToken(token) },
  });
}

/**
 * Prüft den Zugriff der Handy-App. Hier bewusst simpel gehalten (ein
 * gemeinsames Secret), weil es eine Single-User-App ist. Wenn du das an
 * deine bestehende NextAuth-Session hängen willst, ersetz den Body durch
 * einen `auth()`-Aufruf.
 *
 * `timingSafeEqual` statt `===`, damit ein Angreifer den Token nicht über
 * Antwortzeiten Zeichen für Zeichen erraten kann.
 */
export function isAuthorizedUser(req: Request): boolean {
  const expected = process.env.GUARDIAN_USER_TOKEN;
  if (!expected) return false;

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;

  const provided = header.slice(7).trim();

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
