let serverTimeOffsetMs = 0;

export function syncServerTime(serverIsoString: string) {
  const serverTime = new Date(serverIsoString).getTime();
  const clientTime = Date.now();
  serverTimeOffsetMs = serverTime - clientTime;
}

export function getServerTime(): Date {
  return new Date(Date.now() + serverTimeOffsetMs);
}

export function formatSecondsToTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
