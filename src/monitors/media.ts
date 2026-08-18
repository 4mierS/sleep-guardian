import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Fragt die Windows System Media Transport Controls (SMTC) ab – dieselbe
 * WinRT-Schnittstelle, über die auch die Medientasten und das
 * Lockscreen-Widget wissen, was gerade läuft. Deckt Spotify, Browser-Videos
 * (YouTube etc.), VLC und alles andere ab, das sich bei SMTC registriert,
 * ohne dass wir pro App einen eigenen Monitor bräuchten.
 */
const PS_SCRIPT = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await-WinRT($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
$manager = Await-WinRT ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$sessions = @($manager.GetSessions())
$playing = $false
foreach ($s in $sessions) {
  $status = $s.GetPlaybackInfo().PlaybackStatus
  if ($status -eq [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionPlaybackStatus]::Playing) {
    $playing = $true
  }
}
if ($playing) { Write-Output "true" } else { Write-Output "false" }
`;

export async function isMediaPlaying(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      PS_SCRIPT,
    ]);
    return stdout.trim().toLowerCase() === "true";
  } catch (err) {
    console.error("[media] Konnte SMTC-Status nicht lesen:", err);
    return false;
  }
}
