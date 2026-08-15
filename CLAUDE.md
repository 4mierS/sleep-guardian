# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was das ist

Electron-Tray-App (nur Windows), die den PC in Sleep/Shutdown schickt, sobald
für `IDLE_THRESHOLD_MS` nichts Wichtiges mehr läuft. Kein Fenster, kein
Renderer-Prozess — alles läuft im Main-Prozess (`dist/main.js`).

## Befehle

```bash
npm run build   # tsc -p .  (src/ -> dist/)
npm run dev     # tsc -w
npm start       # build + electron .
```

Kein Test-Setup, kein Linter im Repo. Änderungen werden durch `npm run build`
(strict mode ist an) plus manuellen Lauf verifiziert. Da die Monitore echte
Windows-Binaries aufrufen (`powershell.exe`, `tasklist.exe`, `rundll32.exe`),
lässt sich unter WSL/Linux nur kompilieren, nicht sinnvoll ausführen.

**Achtung beim Testen:** ein voller Durchlauf endet damit, dass der Rechner
tatsächlich schläft oder herunterfährt. Zum Ausprobieren `IDLE_THRESHOLD_MS`
klein setzen und `triggerSleepOrShutdown()` vorher stubben, oder das Monitoring
über das Tray-Menü pausieren.

## Architektur

Signalfluss in eine Richtung: Monitore → Guardian-Statemachine → Snapshot →
Tray-UI und Control-Plane.

- `src/monitors/*` — je eine `async () => Promise<boolean>` Funktion pro Signal.
  `network.ts` liest den Windows-Perf-Counter per PowerShell, `steam.ts` baut
  darauf auf (Prozess läuft UND (Rate über Schwelle ODER `content_log.txt`
  frisch beschrieben)), `claudeSessions.ts` fragt einen HTTP-Endpoint.
- `src/state.ts` — `Guardian`, die einzige Zustandsquelle. Pollt alle
  `pollIntervalMs`, hält `AppState` (`active` → `idle-counting` →
  `cancel-window` → `sleeping`) und pusht bei **jedem** Tick einen
  `StatusSnapshot` an die Listener. Alle Remote-/Menü-Aktionen (`sleepNow`,
  `cancelCountdown`, `extendBy`, `setPaused`, `setAction`) sind Methoden hier.
- `src/main.ts` — verdrahtet Guardian, Tray und `RemoteControl`; einziger Ort,
  der Electron-APIs kennt.
- `src/remote.ts` — Outbound-Polling zur Control-Plane: POST
  `/api/agent/heartbeat` alle `heartbeatIntervalMs`, schickt den Snapshot mit
  und bekommt in der Antwort `commands[]` zurück, die `main.ts` auf
  Guardian-Methoden mappt. Bewusst nur ausgehend — kein offener Port am PC.
- `src/config.ts` — alle ENV-Werte an einer Stelle. `config.action` wird zur
  Laufzeit von `setAction()` überschrieben; ansonsten ist `config` read-only
  zu behandeln.
- `src/icons.ts` — vier Tray-Icons als base64-Data-URL, farbcodiert nach State.

Die Control-Plane (Server + Handy-Oberfläche) liegt in einem separaten Repo:
`4mierS/sleep-guardian-control`. Dieses Repo enthält nur den PC-Agenten.

## Konventionen, die hier gelten

- **Fail-safe:** wenn ein Remote-Signal nicht abrufbar ist, gilt „aktiv"
  (`config.failSafeOnApiError`) — lieber wach bleiben als fälschlich schlafen.
  Neue Monitore, die von außen abhängen, sollen sich genauso verhalten.
- **Fehlende Konfiguration deaktiviert das Feature still.** Kein
  `CLAUDE_SESSIONS_API_URL` → Signal wird ignoriert; kein `CONTROL_PLANE_URL`/
  `AGENT_TOKEN` → `RemoteControl.enabled` ist false und die App läuft rein
  lokal. Nie hart failen, weil eine optionale ENV fehlt.
- Kommentare und Log-Ausgaben sind auf Deutsch, Bezeichner auf Englisch.
- Externe Prozesse immer per `execFile` mit Argument-Array aufrufen, nicht
  `exec` mit zusammengebautem String.
- `dist/` ist eingecheckt; nach Änderungen an `src/` also mitbauen und
  committen, sonst läuft der Agent auf altem Stand.

## Bekannte Unschärfen

- `STEAM_PATH` wird in `src/monitors/steam.ts` direkt aus `process.env` gelesen
  statt über `config` — abweichend vom restlichen Muster.
- Das Regex-Parsing von `content_log.txt` ist reine Heuristik und kann bei
  Steam-Updates brechen; ohne die Datei fällt die Erkennung auf die reine
  Netzwerk-Rate zurück.
- Die Netzwerk-Schwelle unterscheidet nicht zwischen Download und Streaming.
