"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MachineState =
  | "active"
  | "idle-counting"
  | "cancel-window"
  | "sleeping"
  | "offline";

interface Machine {
  id: string;
  name: string;
  state: MachineState;
  reasons: string[];
  msUntilSleep: number | null;
  action: "sleep" | "shutdown";
  lastSeenAt: string | null;
}

const STATE_META: Record<MachineState, { label: string; tone: string }> = {
  active: { label: "Beschäftigt", tone: "busy" },
  "idle-counting": { label: "Zählt runter", tone: "counting" },
  "cancel-window": { label: "Gleich aus", tone: "imminent" },
  sleeping: { label: "Schläft", tone: "asleep" },
  offline: { label: "Nicht erreichbar", tone: "offline" },
};

const TOKEN_KEY = "guardian.token";

export default function ControlPage() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setToken(window.localStorage.getItem(TOKEN_KEY));
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/machines", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) {
        setError("Zugangscode stimmt nicht. Bitte neu eingeben.");
        window.localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { machines: Machine[] };
      setMachines(data.machines);
      setError(null);
    } catch {
      setError("Server nicht erreichbar.");
    }
  }, [token]);

  // Nur pollen, solange die App sichtbar ist – spart Handy-Akku.
  useEffect(() => {
    if (!token) return;

    const start = () => {
      load();
      pollRef.current = setInterval(load, 3000);
    };
    const stop = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };

    const onVisibility = () =>
      document.visibilityState === "visible" ? start() : stop();

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [token, load]);

  async function send(
    machineId: string,
    body: Record<string, unknown>
  ) {
    if (!token) return;
    setBusyId(machineId);
    try {
      const res = await fetch(`/api/machines/${machineId}/commands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirming(null);
      await load();
    } catch {
      setError("Befehl kam nicht durch. Nochmal versuchen.");
    } finally {
      setBusyId(null);
    }
  }

  function saveToken() {
    const t = tokenDraft.trim();
    if (!t) return;
    window.localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setTokenDraft("");
    setError(null);
  }

  if (!token) {
    return (
      <>
        <Styles />
        <main className="sg-shell sg-shell--center">
          <div className="sg-gate">
            <p className="sg-eyebrow">Sleep Guardian</p>
            <h1 className="sg-gate-title">Zugangscode eingeben</h1>
            <p className="sg-gate-hint">
              Der Code steht in der <code>.env</code> deines Servers unter{" "}
              <code>GUARDIAN_USER_TOKEN</code>.
            </p>
            <input
              className="sg-input"
              type="password"
              inputMode="text"
              autoComplete="current-password"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveToken()}
              placeholder="••••••••••••"
            />
            <button className="sg-btn sg-btn--primary" onClick={saveToken}>
              Anmelden
            </button>
            {error && <p className="sg-error">{error}</p>}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Styles />
      <main className="sg-shell">
        <header className="sg-header">
          <p className="sg-eyebrow">Sleep Guardian</p>
          <h1 className="sg-title">Deine Rechner</h1>
        </header>

        {error && <p className="sg-error sg-error--banner">{error}</p>}

        {machines.length === 0 && !error && (
          <div className="sg-empty">
            <p>Noch kein Rechner angemeldet.</p>
            <p className="sg-empty-hint">
              Starte die Tray-App auf dem PC — sie meldet sich beim ersten
              Heartbeat automatisch hier an.
            </p>
          </div>
        )}

        {machines.map((m) => (
          <MachineCard
            key={m.id}
            machine={m}
            busy={busyId === m.id}
            confirming={confirming === m.id}
            onConfirmRequest={() => setConfirming(m.id)}
            onConfirmCancel={() => setConfirming(null)}
            onSend={(body) => send(m.id, body)}
          />
        ))}

        <footer className="sg-footer">
          <button
            className="sg-linkbtn"
            onClick={() => {
              window.localStorage.removeItem(TOKEN_KEY);
              setToken(null);
            }}
          >
            Abmelden
          </button>
        </footer>
      </main>
    </>
  );
}

function MachineCard({
  machine,
  busy,
  confirming,
  onConfirmRequest,
  onConfirmCancel,
  onSend,
}: {
  machine: Machine;
  busy: boolean;
  confirming: boolean;
  onConfirmRequest: () => void;
  onConfirmCancel: () => void;
  onSend: (body: Record<string, unknown>) => void;
}) {
  const meta = STATE_META[machine.state] ?? STATE_META.offline;
  const counting =
    machine.state === "idle-counting" || machine.state === "cancel-window";
  const reachable = machine.state !== "offline";

  return (
    <section className={`sg-card sg-card--${meta.tone}`}>
      <div className="sg-card-head">
        <h2 className="sg-machine">{machine.name}</h2>
        <span className="sg-badge">
          <i className="sg-dot" aria-hidden="true" />
          {meta.label}
        </span>
      </div>

      <div className="sg-readout">
        {counting && machine.msUntilSleep !== null ? (
          <>
            <span className="sg-clock">{formatMs(machine.msUntilSleep)}</span>
            <span className="sg-clock-unit">
              bis {machine.action === "shutdown" ? "Herunterfahren" : "Standby"}
            </span>
          </>
        ) : (
          <span className="sg-clock sg-clock--idle">
            {machine.state === "active"
              ? "—:—"
              : machine.state === "sleeping"
              ? "Zzz"
              : "offline"}
          </span>
        )}
      </div>

      {counting && machine.msUntilSleep !== null && (
        <div className="sg-bar" role="progressbar">
          <div
            className="sg-bar-fill"
            style={{ width: `${barPercent(machine.msUntilSleep)}%` }}
          />
        </div>
      )}

      {machine.reasons.length > 0 && (
        <ul className="sg-reasons">
          {machine.reasons.map((r) => (
            <li key={r} className="sg-chip">
              {r}
            </li>
          ))}
        </ul>
      )}

      {machine.state === "active" && machine.reasons.length === 0 && (
        <p className="sg-note">Nichts Wichtiges aktiv. Countdown startet gleich.</p>
      )}

      {!reachable && (
        <p className="sg-note">
          Kein Heartbeat seit über 30 Sekunden. Der PC schläft vermutlich schon
          oder ist aus.
        </p>
      )}

      <div className="sg-actions">
        <button
          className="sg-btn"
          disabled={busy || !counting}
          onClick={() => onSend({ type: "cancel" })}
        >
          Countdown abbrechen
        </button>
        <button
          className="sg-btn"
          disabled={busy || !reachable}
          onClick={() => onSend({ type: "extend", minutes: 30 })}
        >
          30 min mehr
        </button>
        <button
          className="sg-btn"
          disabled={busy || !reachable}
          onClick={() => onSend({ type: "pause" })}
        >
          Überwachung pausieren
        </button>
        <button
          className="sg-btn"
          disabled={busy || !reachable}
          onClick={() => onSend({ type: "resume" })}
        >
          Überwachung fortsetzen
        </button>
      </div>

      <div className="sg-danger">
        {confirming ? (
          <div className="sg-confirm">
            <p className="sg-confirm-text">
              {machine.action === "shutdown" ? "Herunterfahren" : "Schlafen legen"}{" "}
              — auch wenn noch was läuft?
            </p>
            <div className="sg-confirm-row">
              <button className="sg-btn sg-btn--ghost" onClick={onConfirmCancel}>
                Zurück
              </button>
              <button
                className="sg-btn sg-btn--danger"
                disabled={busy}
                onClick={() => onSend({ type: "sleep-now" })}
              >
                Ja, jetzt
              </button>
            </div>
          </div>
        ) : (
          <button
            className="sg-btn sg-btn--danger"
            disabled={busy || !reachable}
            onClick={onConfirmRequest}
          >
            Sofort {machine.action === "shutdown" ? "herunterfahren" : "schlafen legen"}
          </button>
        )}
      </div>

      <div className="sg-modeswitch">
        <span className="sg-modelabel">Beim Countdown:</span>
        <div className="sg-segmented">
          <button
            className={`sg-seg ${machine.action === "sleep" ? "is-on" : ""}`}
            disabled={busy || !reachable}
            onClick={() => onSend({ type: "set-action", action: "sleep" })}
          >
            Standby
          </button>
          <button
            className={`sg-seg ${machine.action === "shutdown" ? "is-on" : ""}`}
            disabled={busy || !reachable}
            onClick={() => onSend({ type: "set-action", action: "shutdown" })}
          >
            Herunterfahren
          </button>
        </div>
      </div>
    </section>
  );
}

function formatMs(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Balken relativ zu 10 Minuten – rein visuell, deckelt bei 100%. */
function barPercent(ms: number) {
  return Math.min(100, Math.max(0, (ms / 600_000) * 100));
}

function Styles() {
  return (
    <style>{`
      .sg-shell {
        --bg: #131A22;
        --surface: #1B2530;
        --surface-2: #223040;
        --line: #2E3D4E;
        --text: #E8EDF2;
        --muted: #8496A8;
        --tone: #64748B;
        --danger: #F0787A;

        min-height: 100dvh;
        margin: 0 auto;
        padding: 28px 18px calc(28px + env(safe-area-inset-bottom));
        max-width: 560px;
        background: var(--bg);
        color: var(--text);
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        box-sizing: border-box;
      }
      .sg-shell--center {
        display: flex; align-items: center; justify-content: center;
      }
      .sg-shell *, .sg-shell *::before, .sg-shell *::after { box-sizing: border-box; }

      .sg-eyebrow {
        margin: 0 0 6px; font-size: 11px; letter-spacing: .16em;
        text-transform: uppercase; color: var(--muted); font-weight: 600;
      }
      .sg-title { margin: 0 0 22px; font-size: 26px; font-weight: 650; letter-spacing: -.02em; }
      .sg-header { margin-bottom: 4px; }

      /* Statusfarbe steuert die ganze Karte – die Karte IST die Statuslampe. */
      .sg-card {
        background: var(--surface);
        border: 1px solid var(--line);
        border-left: 3px solid var(--tone);
        border-radius: 14px;
        padding: 18px 16px;
        margin-bottom: 16px;
      }
      .sg-card--busy     { --tone: #5FD68A; }
      .sg-card--counting { --tone: #F2B84B; }
      .sg-card--imminent { --tone: #F0787A; }
      .sg-card--asleep   { --tone: #7C8BA8; }
      .sg-card--offline  { --tone: #4A5A6B; }

      .sg-card-head {
        display: flex; align-items: baseline; justify-content: space-between;
        gap: 12px; margin-bottom: 14px;
      }
      .sg-machine { margin: 0; font-size: 17px; font-weight: 600; }
      .sg-badge {
        display: inline-flex; align-items: center; gap: 7px;
        font-size: 12px; color: var(--muted); white-space: nowrap;
      }
      .sg-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--tone); flex: none;
      }
      .sg-card--imminent .sg-dot { animation: sg-pulse 1.1s ease-in-out infinite; }
      @keyframes sg-pulse { 50% { opacity: .25; } }
      @media (prefers-reduced-motion: reduce) {
        .sg-card--imminent .sg-dot { animation: none; }
      }

      .sg-readout { display: flex; align-items: baseline; gap: 10px; }
      .sg-clock {
        font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
        font-size: 40px; font-weight: 600; letter-spacing: -.02em;
        color: var(--tone); font-variant-numeric: tabular-nums;
      }
      .sg-clock--idle { color: var(--muted); font-size: 30px; }
      .sg-clock-unit { font-size: 12px; color: var(--muted); }

      .sg-bar {
        height: 4px; border-radius: 2px; background: var(--surface-2);
        margin-top: 12px; overflow: hidden;
      }
      .sg-bar-fill {
        height: 100%; background: var(--tone);
        transition: width .8s linear;
      }
      @media (prefers-reduced-motion: reduce) { .sg-bar-fill { transition: none; } }

      .sg-reasons {
        list-style: none; display: flex; flex-wrap: wrap; gap: 6px;
        margin: 14px 0 0; padding: 0;
      }
      .sg-chip {
        font-size: 12px; padding: 5px 10px; border-radius: 100px;
        background: var(--surface-2); color: var(--text);
      }
      .sg-note { margin: 13px 0 0; font-size: 13px; color: var(--muted); line-height: 1.5; }

      .sg-actions {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 18px;
      }
      .sg-btn {
        appearance: none; width: 100%; min-height: 46px;
        padding: 12px 14px; border-radius: 10px;
        border: 1px solid var(--line); background: var(--surface-2);
        color: var(--text); font-size: 14px; font-weight: 550;
        font-family: inherit; cursor: pointer;
      }
      .sg-btn:disabled { opacity: .38; cursor: not-allowed; }
      .sg-btn:focus-visible { outline: 2px solid var(--tone); outline-offset: 2px; }
      .sg-btn--primary { background: #3D7FD6; border-color: #3D7FD6; margin-top: 12px; }
      .sg-btn--ghost { background: transparent; }
      .sg-btn--danger {
        background: transparent; border-color: var(--danger); color: var(--danger);
      }

      .sg-danger { margin-top: 8px; }
      .sg-confirm {
        border: 1px solid var(--danger); border-radius: 10px; padding: 12px;
      }
      .sg-confirm-text { margin: 0 0 10px; font-size: 13px; line-height: 1.45; }
      .sg-confirm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

      .sg-modeswitch {
        display: flex; align-items: center; justify-content: space-between;
        gap: 10px; margin-top: 16px; padding-top: 14px;
        border-top: 1px solid var(--line);
      }
      .sg-modelabel { font-size: 12px; color: var(--muted); }
      .sg-segmented {
        display: inline-flex; background: var(--surface-2);
        border-radius: 8px; padding: 3px; gap: 3px;
      }
      .sg-seg {
        appearance: none; border: 0; background: transparent; color: var(--muted);
        font-family: inherit; font-size: 12px; font-weight: 550;
        padding: 8px 11px; border-radius: 6px; cursor: pointer; min-height: 36px;
      }
      .sg-seg.is-on { background: var(--bg); color: var(--text); }
      .sg-seg:disabled { opacity: .4; cursor: not-allowed; }

      .sg-gate { width: 100%; max-width: 340px; }
      .sg-gate-title { margin: 0 0 8px; font-size: 22px; font-weight: 650; }
      .sg-gate-hint { margin: 0 0 18px; font-size: 13px; color: var(--muted); line-height: 1.55; }
      .sg-gate-hint code {
        font-family: ui-monospace, Menlo, monospace; font-size: 12px;
        background: var(--surface-2); padding: 2px 5px; border-radius: 4px;
      }
      .sg-input {
        width: 100%; min-height: 48px; padding: 12px 14px;
        border-radius: 10px; border: 1px solid var(--line);
        background: var(--surface); color: var(--text);
        font-size: 16px; font-family: inherit;
      }
      .sg-input:focus-visible { outline: 2px solid #3D7FD6; outline-offset: 2px; }

      .sg-error { margin: 14px 0 0; font-size: 13px; color: var(--danger); }
      .sg-error--banner {
        margin: 0 0 16px; padding: 11px 13px; border-radius: 9px;
        background: rgba(240,120,122,.11); border: 1px solid rgba(240,120,122,.3);
      }

      .sg-empty {
        border: 1px dashed var(--line); border-radius: 14px;
        padding: 26px 18px; text-align: center;
      }
      .sg-empty p { margin: 0; font-size: 14px; }
      .sg-empty-hint { margin-top: 8px !important; font-size: 13px; color: var(--muted); line-height: 1.5; }

      .sg-footer { margin-top: 26px; text-align: center; }
      .sg-linkbtn {
        appearance: none; border: 0; background: none; color: var(--muted);
        font-family: inherit; font-size: 13px; cursor: pointer; padding: 10px;
      }
    `}</style>
  );
}
