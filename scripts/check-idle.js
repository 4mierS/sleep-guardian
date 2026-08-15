// Wegwerf-Prüfskript. Startet: npx electron scripts/check-idle.js
//
// Zeigt im Sekundentakt, was Electron über deine Leerlaufzeit weiß. Erwartung:
// der Wert steigt, wenn du die Hände von Tastatur und Maus nimmst, und springt
// beim ersten Tastendruck zurück auf 0. Tut er das, ist der Anwesenheits-
// Monitor auf dieser Maschine verlässlich. Abbruch mit Strg+C.
//
// Gehört nicht zur App — nach der Prüfung kann die Datei weg.
const { app, powerMonitor } = require("electron");

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  console.log("Sekunden seit letzter Eingabe (Strg+C zum Beenden):\n");

  setInterval(() => {
    const idle = powerMonitor.getSystemIdleTime();
    const state = powerMonitor.getSystemIdleState(300);
    console.log(`  idle: ${String(idle).padStart(4)}s    Zustand: ${state}`);
  }, 1000);
});

// Ohne Fenster würde Electron sonst sofort wieder beenden.
app.on("window-all-closed", () => {});
