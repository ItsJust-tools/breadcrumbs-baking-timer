export const MINUTES = 'min';

export function minutesToMs(minutes: number): number {
  return Math.max(1, Math.round(minutes)) * 60 * 1000;
}

export function msToMinutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60000));
}
