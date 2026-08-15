import { BrowserWindow } from "electron";
import * as QRCode from "qrcode";
import { requestPairingCode, pairingUrl } from "./pairing";

let current: BrowserWindow | null = null;

/**
 * Zeigt den Pairing-QR in einem eigenen Fenster.
 *
 * Bewusst ohne preload, ohne IPC und ohne Dateizugriff: der gesamte Inhalt
 * wird als data:-URL geladen und besteht aus statischem HTML plus dem
 * eingebetteten QR-Bild. Der Renderer hat damit weder Node noch eine
 * Möglichkeit, irgendetwas nachzuladen — die Angriffsfläche, die ein
 * BrowserWindow sonst mitbringt, entsteht hier gar nicht erst.
 */
export async function showPairingWindow(): Promise<void> {
  // Ein zweites Fenster würde einen zweiten Code anfordern und den ersten
  // damit entwerten — also lieber das bestehende nach vorn holen.
  if (current && !current.isDestroyed()) {
    current.focus();
    return;
  }

  const { code, expiresAt } = await requestPairingCode();
  const url = pairingUrl(code);
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 260,
    margin: 1,
    color: { dark: "#131A22", light: "#FFFFFF" },
  });

  const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));

  const win = new BrowserWindow({
    width: 380,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Handy koppeln",
    backgroundColor: "#131A22",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  win.setMenuBarVisibility(false);
  current = win;
  win.on("closed", () => {
    current = null;
  });

  // Das Fenster darf nirgendwohin navigieren – es gibt nichts zu klicken,
  // aber die Sperre kostet zwei Zeilen.
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  await win.loadURL(
    "data:text/html;charset=utf-8;base64," +
      Buffer.from(pageHtml(qrDataUrl, code, secondsLeft), "utf-8").toString(
        "base64"
      )
  );

  // Wenn der Code abgelaufen ist, ist das Fenster wertlos.
  setTimeout(() => {
    if (!win.isDestroyed()) win.close();
  }, Math.max(1000, expiresAt - Date.now()) + 500);
}

function pageHtml(qr: string, code: string, seconds: number): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>Handy koppeln</title>
<style>
  body {
    margin: 0; padding: 26px 22px;
    background: #131A22; color: #E8EDF2;
    font-family: system-ui, "Segoe UI", sans-serif;
    text-align: center; user-select: none;
  }
  h1 { margin: 0 0 6px; font-size: 18px; font-weight: 650; }
  p  { margin: 0 0 18px; font-size: 13px; color: #8496A8; line-height: 1.5; }
  .qr { background: #fff; padding: 12px; border-radius: 12px; display: inline-block; }
  .qr img { display: block; width: 260px; height: 260px; }
  .code {
    margin-top: 16px; font-family: ui-monospace, Consolas, monospace;
    font-size: 17px; letter-spacing: .06em; color: #E8EDF2;
    background: #223040; padding: 9px 14px; border-radius: 8px;
    display: inline-block; user-select: text;
  }
  .hint { margin-top: 8px; font-size: 11px; color: #8496A8; }
  .timer { margin-top: 14px; font-size: 12px; color: #F2B84B; }
  .timer.out { color: #F0787A; }
</style>
<h1>Handy koppeln</h1>
<p>Scanne den Code mit der Kamera deines Handys.</p>
<div class="qr"><img src="${qr}" alt="QR-Code zum Koppeln"></div>
<div class="code">${escapeHtml(code)}</div>
<div class="hint">Falls das Scannen nicht klappt, diesen Code in der App eingeben.</div>
<div class="timer" id="t"></div>
<script>
  var left = ${seconds};
  var el = document.getElementById("t");
  function tick() {
    if (left <= 0) {
      el.textContent = "Code abgelaufen – Fenster schließt sich.";
      el.className = "timer out";
      return;
    }
    el.textContent = "Gültig noch " + left + " Sekunden";
    left--;
    setTimeout(tick, 1000);
  }
  tick();
</script>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!
  );
}
