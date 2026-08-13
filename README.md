# Sleep Guardian

Kleine Windows-Tray-App: legt den PC schlafen (oder fährt ihn runter),
sobald **10 Minuten lang** nichts Wichtiges mehr läuft — geprüft werden:

- Netzwerk-Download allgemein (Bytes/s über Windows Perf Counter)
- Steam-Downloads speziell (Prozess-Check + optional `content_log.txt`)
- Aktive Claude Code Sessions auf deinem Hetzner-Orchestrator (per API)

Tray-Icon zeigt den Status farblich: grün = aktiv, grau = idle (Countdown
läuft), orange = letzte 60s vor dem Sleep (abbrechbar), rot = Sleep wird
ausgelöst.

## Setup

```bash
cd sleep-guardian
npm install
cp .env.example .env
# .env anpassen, siehe unten
npm start
```

`npm start` kompiliert TypeScript und startet Electron. Für Autostart beim
Windows-Login: Task Scheduler-Eintrag anlegen, der `npm start` (bzw. besser:
die gepackte .exe, siehe unten) beim Login ausführt — läuft nur im Tray,
kein sichtbares Fenster.

### ENV laden

Electron liest `.env` nicht automatisch selbst — `dotenv` übernimmt das in
`main.ts`. Wenn du die App über den Task Scheduler startest, stell sicher,
dass das Arbeitsverzeichnis auf den `sleep-guardian`-Ordner zeigt, damit
`.env` gefunden wird (Task Scheduler: "Start in" Feld setzen).

### Als .exe packen (optional)

Für echten Autostart ohne offene Konsole lohnt sich `electron-builder`:

```bash
npm install --save-dev electron-builder
npx electron-builder --win --dir
```

Danach die erzeugte `.exe` im Task Scheduler bei "An-/Abmeldung" starten
lassen.

## Konfiguration (.env)

| Variable | Bedeutung | Default |
|---|---|---|
| `IDLE_THRESHOLD_MS` | Wie lange nach letzter Aktivität bis Sleep | 600000 (10 min) |
| `CANCEL_WINDOW_MS` | Abbrechbares Zeitfenster kurz vor dem Sleep | 60000 |
| `SLEEP_ACTION` | `sleep` oder `shutdown` | `sleep` |
| `NETWORK_THRESHOLD_BYTES_PER_SEC` | Ab wann gilt Netzwerk als "Download aktiv" | 1500000 (1.5 MB/s) |
| `CLAUDE_SESSIONS_API_URL` | Endpoint für aktive Claude-Sessions | — |
| `CLAUDE_SESSIONS_API_TOKEN` | Optionaler Bearer-Token | — |

## Der fehlende Baustein: Hetzner-Endpoint

Die App geht davon aus, dass dein Orchestrator (das Dashboard-Projekt mit
Prisma/Postgres) einen simplen JSON-Endpoint bereitstellt, z.B.
`GET /api/sessions/active`:

```json
{ "activeCount": 2 }
```

Minimalbeispiel für eine Next.js Route in deinem Orchestrator-Projekt:

```ts
// app/api/sessions/active/route.ts
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token !== process.env.SLEEP_GUARDIAN_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const activeCount = await prisma.session.count({
    where: { status: { in: ["RUNNING", "PENDING"] } },
  });

  return NextResponse.json({ activeCount });
}
```

Passe `where` an dein tatsächliches Schema an (Modellname, Status-Enum-Werte
etc. — die hier verwendeten sind nur Platzhalter).

Falls die API mal nicht erreichbar ist, geht die App **fail-safe** davon
aus, dass noch etwas läuft (`failSafeOnApiError` in `src/config.ts`) — der
PC schläft also im Zweifel nicht fälschlicherweise ein, während irgendwo im
Hintergrund noch ein Task läuft, den du nur wegen eines Netzwerkfehlers
nicht siehst.

## Steuerung vom Handy

Siehe `control-plane/README.md`. Kurzfassung: dein Hetzner-Server wird zum
Vermittler, der PC fragt dort alle 5s nach Befehlen, das Handy schreibt die
Befehle rein. Keine Portfreigabe nötig.

Ohne `CONTROL_PLANE_URL` in der `.env` bleibt die Fernsteuerung einfach aus
und die Tray-App funktioniert wie vorher rein lokal.

## Grenzen / Dinge, die du evtl. noch anpassen willst

- **Netzwerk-Heuristik ist grob.** Ein Youtube-Video im Hintergrund kann
  ebenfalls über der Schwelle liegen. Die Steam-Erkennung ist präziser, weil
  sie zusätzlich prüft, ob `steam.exe` überhaupt läuft und (optional) ob
  `content_log.txt` gerade beschrieben wird.
- **`content_log.txt`-Parsing ist ein Heuristik-Regex**, kein offizielles
  Steam-API-Feature — kann bei Steam-Updates brechen. Notfalls einfach
  `STEAM_PATH` leer lassen / Datei löschen lassen, dann fällt es auf reine
  Netzwerk-Erkennung zurück.
- **Mehrere Monitore/Sessions:** Falls du mehrere Claude-Orchestrator-Instanzen
  hast, einfach den Endpoint serverseitig über alle aggregieren lassen —
  die App selbst kennt nur einen `activeCount`.
