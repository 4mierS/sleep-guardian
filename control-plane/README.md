# Control-Plane (Hetzner)

Diese Dateien gehören in dein bestehendes Next.js-Orchestrator-Projekt, nicht
in die Tray-App. Sie sind der Vermittler zwischen PC und Handy.

## Warum überhaupt ein Server dazwischen?

Dein PC hängt zuhause hinter NAT. Damit das Handy von unterwegs drankommt,
gäbe es drei Wege:

| Weg | Nachteil |
|---|---|
| Portfreigabe + DynDNS | Dein PC hängt offen im Internet. Für "fahr dich runter"-Endpunkte keine gute Idee. |
| VPN (Tailscale/WireGuard) | Zusätzliches Tooling auf PC und Handy, muss immer laufen. |
| **Server als Vermittler** | Nutzt Infrastruktur, die du schon hast. |

Der dritte Weg gewinnt hier klar, weil du den Hetzner-Server samt Coolify,
Postgres und HTTPS ohnehin schon betreibst. Wichtig dabei: **der PC baut die
Verbindung immer selbst nach außen auf.** Er fragt alle 5 Sekunden beim Server
nach, ob ein Befehl vorliegt. Es geht nie eine Verbindung von außen auf deinen
PC — keine Portfreigabe, kein offener Port, nichts im Router zu ändern.

```
Handy  ──HTTPS──▶  Hetzner (Next.js + Postgres)  ◀──HTTPS──  PC (Tray-App)
       schreibt         Befehls-Queue                 fragt alle 5s ab
       Befehle          + letzter Status              und meldet Status
```

Die Latenz einer Aktion ist dadurch max. ~5s (`HEARTBEAT_INTERVAL_MS`).
Kürzer geht, kostet aber mehr Requests; 5s fühlt sich beim Tippen auf dem
Handy schon direkt an.

## Dateien einsortieren

| Datei hier | Ziel im Orchestrator-Projekt |
|---|---|
| `prisma/schema-fragment.prisma` | Inhalt an `prisma/schema.prisma` anhängen |
| `lib/guardian-auth.ts` | `lib/guardian-auth.ts` |
| `app/api/agent/heartbeat/route.ts` | gleicher Pfad |
| `app/api/machines/route.ts` | gleicher Pfad |
| `app/api/machines/[id]/commands/route.ts` | gleicher Pfad |
| `app/control/page.tsx` + `layout.tsx` | gleicher Pfad |
| `public/guardian-*` | `public/` |
| `scripts/register-machine.ts` | `scripts/` |

Die Routen importieren `@/lib/prisma` — passe den Import an, falls dein
Prisma-Client woanders liegt.

## Einrichten

```bash
# 1. Migration
npx prisma migrate dev --name sleep_guardian

# 2. Zugangscode fürs Handy erzeugen und in die Server-.env eintragen
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
# -> GUARDIAN_USER_TOKEN=<ausgabe>

# 3. PC registrieren; gibt AGENT_TOKEN aus
npx tsx scripts/register-machine.ts "Desktop"

# 4. Deployen (Coolify)
```

Dann auf dem PC in die `.env` der Tray-App:

```
CONTROL_PLANE_URL=https://dein-orchestrator.de
AGENT_NAME=Desktop
AGENT_TOKEN=<aus Schritt 3>
```

Und am Handy `https://dein-orchestrator.de/control` öffnen → Zugangscode aus
Schritt 2 eingeben → über das Teilen-Menü "Zum Home-Bildschirm". Danach
startet sie wie eine normale App im Vollbild.

## Sicherheit

Das hier ist ein öffentlich erreichbarer Endpunkt, der deinen PC herunterfahren
kann. Was eingebaut ist:

- **Zwei getrennte Token.** Der PC hat einen anderen als das Handy. Der
  Agent-Token darf nur Status melden und Befehle abholen, nie welche anlegen.
- **Nur Hashes in der DB.** Wer die Datenbank hat, kann sich nicht als dein
  PC ausgeben.
- **`timingSafeEqual`** beim Handy-Token, damit er sich nicht über
  Antwortzeiten erraten lässt.
- **Whitelist der Befehlstypen** und Validierung der Parameter (`minutes`
  gedeckelt auf 480).
- **`robots: noindex`** auf der Steuerseite.

Was du noch ergänzen solltest, wenn dir das wichtig ist:

- **Rate-Limiting** auf `/api/machines/*` — sonst kann jemand den Zugangscode
  unbegrenzt durchprobieren. Bei 32 Byte Zufall dauert das zwar praktisch
  ewig, aber ein Limit ist billig.
- Wenn dein Orchestrator schon NextAuth hat: `isAuthorizedUser()` durch einen
  `auth()`-Aufruf ersetzen und den geteilten Zugangscode ganz weglassen. Das
  wäre die sauberere Lösung — der Shared-Secret-Ansatz ist hier nur drin,
  damit es ohne Abhängigkeit von deinem Auth-Setup läuft.

## Was NICHT geht: Aufwecken

Software kann einen schlafenden PC nicht aufwecken — das ist keine Grenze
dieser App, sondern von Standby generell. Dafür bräuchtest du Wake-on-LAN,
und das Magic Packet muss aus deinem Heimnetz kommen. Ein Raspberry Pi oder
dein Router (Fritz!Box kann WoL) könnte das übernehmen, wenn du es brauchst.
Vom Handy aus direkt über den Hetzner-Server geht es nicht.
