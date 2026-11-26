import type { Tool, DeserializeResult } from '@itsjust/core';
import toolConfig from './tool.config';
import {
  DEFAULT_STATE,
  MAX_STEPS,
  MIN_DURATION_MS,
  emptyRun,
  normalizeDuration,
  type BakeStep,
  type StepRun,
  type ToolState,
} from './types';

const SHARE_VERSION = 1;

interface SerializedStep {
  name: string;
  durationMs: number;
  tempNote: string;
}

interface SerializedState {
  v: number;
  steps: SerializedStep[];
  runs: Record<
    string,
    {
      startedAt: number | null;
      pausedAt: number | null;
      pausedAccumMs: number;
      finishedAt: number | null;
      alarmDismissed: boolean;
    }
  >;
  planStartedAt: number | null;
  soundEnabled: boolean;
}

/**
 * Serialize tool state into a compact JSON string for share/import.
 * Steps are stored without ids; ids are regenerated on load, and run state
 * is re-keyed to the new ids by position so a shared running plan survives
 * the round trip.
 */
export function serializeState(state: ToolState): string {
  const idToIndex = new Map<string, number>();
  state.steps.forEach((step, i) => idToIndex.set(step.id, i));
  const runs: SerializedState['runs'] = {};
  for (const [id, run] of Object.entries(state.runs)) {
    const index = idToIndex.get(id);
    if (index === undefined) continue;
    runs[String(index)] = {
      startedAt: run.startedAt,
      pausedAt: run.pausedAt,
      pausedAccumMs: run.pausedAccumMs,
      finishedAt: run.finishedAt,
      alarmDismissed: run.alarmDismissed,
    };
  }
  const payload: SerializedState = {
    v: SHARE_VERSION,
    steps: state.steps.slice(0, MAX_STEPS).map((s) => ({
      name: s.name,
      durationMs: s.durationMs,
      tempNote: s.tempNote,
    })),
    runs,
    planStartedAt: state.planStartedAt,
    soundEnabled: state.soundEnabled,
  };
  return JSON.stringify(payload);
}

function sanitizeTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sanitizedRun(value: unknown, now: number): StepRun {
  const run = emptyRun();
  if (typeof value !== 'object' || value === null) return run;
  const v = value as Record<string, unknown>;
  const startedAt = sanitizeTimestamp(v.startedAt);
  const finishedAt = sanitizeTimestamp(v.finishedAt);
  const pausedAt = sanitizeTimestamp(v.pausedAt);
  const pausedAccumMs =
    typeof v.pausedAccumMs === 'number' && Number.isFinite(v.pausedAccumMs) && v.pausedAccumMs >= 0
      ? v.pausedAccumMs
      : 0;
  return {
    startedAt,
    pausedAt,
    pausedAccumMs: Math.min(pausedAccumMs, Math.max(0, Math.max(0, now) + MIN_DURATION_MS * 1000)),
    finishedAt,
    alarmDismissed: v.alarmDismissed === true,
  };
}

/**
 * Validate and recover tool state from an arbitrary payload.
 * Unknown shapes fall back to sane defaults rather than throwing, and a
 * corrupted payload yields success:false with a message instead of crashing.
 */
export function deserializeState(data: unknown, now = Date.now()): DeserializeResult<ToolState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { success: false, error: 'Invalid data format: expected bake plan state object' };
  }
  const v = data as Record<string, unknown>;
  const rawSteps = v.steps;
  if (!Array.isArray(rawSteps)) {
    return { success: false, error: 'Invalid bake plan: missing steps array' };
  }
  const steps: BakeStep[] = [];
  const runs: Record<string, StepRun> = {};
  for (const raw of rawSteps.slice(0, MAX_STEPS)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const s = raw as Record<string, unknown>;
    const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'Untitled step';
    const durationMs = normalizeDuration(s.durationMs, (5 * MIN_DURATION_MS * 1000) / 1000);
    const tempNote = typeof s.tempNote === 'string' ? s.tempNote : '';
    const id = `s-${steps.length}-${Math.random().toString(36).slice(2, 8)}`;
    steps.push({ id, name, durationMs, tempNote });
    const index = steps.length - 1;
    const rawRuns = v.runs;
    const runValue =
      typeof rawRuns === 'object' && rawRuns !== null
        ? (rawRuns as Record<string, unknown>)[String(index)]
        : undefined;
    runs[id] = sanitizedRun(runValue, now);
  }
  const planStartedAt = sanitizeTimestamp(v.planStartedAt);
  const state: ToolState = {
    steps,
    runs,
    planStartedAt,
    soundEnabled: v.soundEnabled !== false,
  };
  return { success: true, data: state };
}

/** True when a serialized string round-trips back to the same plan shape. */
export function roundTrips(state: ToolState, now = Date.now()): boolean {
  try {
    const restored = deserializeState(JSON.parse(serializeState(state)), now);
    if (!restored.success) return false;
    const a = serializeState(restored.data);
    const b = serializeState(state);
    const norm = (s: string) => s.replace(/"s-\d+-[a-z0-9]+"/g, '"ID"').replace(/\d{10,}/g, 'T');
    return norm(a) === norm(b);
  } catch {
    return false;
  }
}

export const breadcrumbsBakingTimerTool: Tool<ToolState> = {
  id: toolConfig.id,
  name: toolConfig.name,
  version: toolConfig.version,
  config: toolConfig,
  initialState: { ...DEFAULT_STATE, steps: [], runs: {} },
  serialize: serializeState,
  deserialize: (data: unknown) => deserializeState(data),
  exporters: [
    { format: 'png', loader: () => import('./exporters/png') },
    { format: 'jpeg', loader: () => import('./exporters/jpeg') },
    { format: 'webp', loader: () => import('./exporters/webp') },
    { format: 'pdf', loader: () => import('./exporters/pdf') },
  ],
};

export default breadcrumbsBakingTimerTool;
