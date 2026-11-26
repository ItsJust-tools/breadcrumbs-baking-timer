export interface BakeStep {
  /** Stable unique id for the step (persists across reorders). */
  id: string;
  /** Human readable step name, e.g. "Bulk ferment". */
  name: string;
  /** Planned duration in milliseconds (positive). */
  durationMs: number;
  /** Freeform temperature note, e.g. "26°C dough temp". */
  tempNote: string;
}

export interface StepRun {
  /** Epoch ms when the step was (first) started; null when not started. */
  startedAt: number | null;
  /** Epoch ms when the step was paused; null while running/resumed/reset. */
  pausedAt: number | null;
  /** Total paused time subtracted from wall clock. */
  pausedAccumMs: number;
  /** Epoch ms when the step finished; null until then. Set exactly once. */
  finishedAt: number | null;
  /** Whether the finish alarm/flash was dismissed by the user. */
  alarmDismissed: boolean;
}

export interface ToolState {
  /** Ordered bake plan steps. */
  steps: BakeStep[];
  /** Per-step running state, keyed by step id. */
  runs: Record<string, StepRun>;
  /** Epoch ms when the plan (first step) was started; null when never started. */
  planStartedAt: number | null;
  /** Whether audio alarms are enabled. */
  soundEnabled: boolean;
}

export const DEFAULT_STATE: ToolState = {
  steps: [],
  runs: {},
  planStartedAt: null,
  soundEnabled: true,
};

export const MIN_DURATION_MS = 1000;
export const MAX_STEPS = 24;

/** Create a fresh (not started) run entry. */
export function emptyRun(): StepRun {
  return {
    startedAt: null,
    pausedAt: null,
    pausedAccumMs: 0,
    finishedAt: null,
    alarmDismissed: false,
  };
}

/** Generate a reasonably unique step id. */
export function createStepId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalize a duration to a positive millisecond value. */
export function normalizeDuration(ms: unknown, fallback = 0): number {
  const value = typeof ms === 'number' && Number.isFinite(ms) ? ms : fallback;
  return Math.max(MIN_DURATION_MS, Math.round(value));
}

/** Elapsed wall-clock time of a run at instant `now`, or 0 before it starts. */
export function elapsedMs(run: StepRun | undefined, now: number): number {
  if (!run || run.startedAt === null || run.startedAt > now) return 0;
  const end = run.pausedAt !== null && run.pausedAt < now ? run.pausedAt : now;
  return Math.max(0, end - run.startedAt - run.pausedAccumMs);
}

/** Milliseconds remaining in a step, clamped at 0 once finished. */
export function remainingMs(run: StepRun | undefined, durationMs: number, now: number): number {
  return Math.max(0, durationMs - elapsedMs(run, now));
}

/** True when the step has run its full duration. */
export function isFinished(run: StepRun | undefined, durationMs: number, now: number): boolean {
  if (!run) return false;
  if (run.finishedAt !== null) return true;
  return remainingMs(run, durationMs, now) <= 0 && run.startedAt !== null;
}

/** True while a step counts down (started, not paused, not finished). */
export function isRunning(run: StepRun | undefined, durationMs: number, now: number): boolean {
  if (!run || run.startedAt === null || run.pausedAt !== null || run.finishedAt !== null) {
    return false;
  }
  return remainingMs(run, durationMs, now) > 0;
}

export function isPaused(run: StepRun | undefined): boolean {
  return Boolean(run && run.startedAt !== null && run.pausedAt !== null && run.finishedAt === null);
}

/**
 * Mark a step finished at `now`. Sets finishedAt exactly once: subsequent
 * calls with an already-finished run return the same state and no alarm.
 */
export function finishStep(state: ToolState, stepId: string, now: number): ToolState {
  const run = state.runs[stepId];
  if (!run || run.startedAt === null || run.finishedAt !== null) return state;
  return {
    ...state,
    runs: {
      ...state.runs,
      [stepId]: { ...run, pausedAt: null, finishedAt: now > 0 ? now : run.startedAt },
    },
  };
}

/** Start (or resume) a step. Starting an already-running/finished step is a no-op. */
export function startStep(state: ToolState, stepId: string, now: number): ToolState {
  const run = state.runs[stepId] ?? emptyRun();
  if (run.startedAt === null) {
    return {
      ...state,
      planStartedAt: state.planStartedAt ?? now,
      runs: { ...state.runs, [stepId]: { ...run, startedAt: now, pausedAt: null } },
    };
  }
  if (run.pausedAt !== null) {
    const pausedFor = Math.max(0, now - run.pausedAt);
    return {
      ...state,
      runs: {
        ...state.runs,
        [stepId]: { ...run, pausedAt: null, pausedAccumMs: run.pausedAccumMs + pausedFor },
      },
    };
  }
  return state;
}

/** Pause a running step, banking elapsed time. */
export function pauseStep(state: ToolState, stepId: string, now: number): ToolState {
  const run = state.runs[stepId];
  if (!run || run.startedAt === null || run.pausedAt !== null || run.finishedAt !== null) {
    return state;
  }
  return { ...state, runs: { ...state.runs, [stepId]: { ...run, pausedAt: now } } };
}

/** Reset a step back to its not-started state (keeps the step definition). */
export function resetStep(state: ToolState, stepId: string): ToolState {
  if (!state.runs[stepId]) return state;
  return { ...state, runs: { ...state.runs, [stepId]: emptyRun() } };
}

/** Dismiss the finish flash/alarm for a step. */
export function dismissAlarm(state: ToolState, stepId: string): ToolState {
  const run = state.runs[stepId];
  if (!run || run.alarmDismissed) return state;
  return {
    ...state,
    runs: { ...state.runs, [stepId]: { ...run, alarmDismissed: true } },
  };
}

/** Append a new step; runs map gains an entry without touching existing runs. */
export function addStep(
  state: ToolState,
  step: { name: string; durationMs: number; tempNote?: string }
): ToolState {
  if (state.steps.length >= MAX_STEPS) return state;
  const newStep: BakeStep = {
    id: createStepId(),
    name: step.name.trim() || 'Untitled step',
    durationMs: normalizeDuration(step.durationMs),
    tempNote: step.tempNote?.trim() ?? '',
  };
  return {
    ...state,
    steps: [...state.steps, newStep],
    runs: { ...state.runs, [newStep.id]: emptyRun() },
  };
}

/** Duplicate a step (including its definition); the copy starts fresh. */
export function duplicateStep(state: ToolState, stepId: string): ToolState {
  const index = state.steps.findIndex((s) => s.id === stepId);
  if (index === -1) return state;
  const source = state.steps[index] as BakeStep;
  if (state.steps.length >= MAX_STEPS) return state;
  const copy: BakeStep = {
    ...source,
    id: createStepId(),
    name: `${source.name} (copy)`,
  };
  const steps = [...state.steps];
  steps.splice(index + 1, 0, copy);
  return { ...state, steps, runs: { ...state.runs, [copy.id]: emptyRun() } };
}

/** Delete a step and its run state; other steps' runs are untouched. */
export function deleteStep(state: ToolState, stepId: string): ToolState {
  if (!state.steps.some((s) => s.id === stepId)) return state;
  const runs = { ...state.runs };
  delete runs[stepId];
  return { ...state, steps: state.steps.filter((s) => s.id !== stepId), runs };
}

/** Move a step within the plan; run state is kept, keyed by id. */
export function moveStep(state: ToolState, from: number, to: number): ToolState {
  if (from === to || from < 0 || to < 0 || from >= state.steps.length || to >= state.steps.length) {
    return state;
  }
  const steps = [...state.steps];
  const [moved] = steps.splice(from, 1);
  steps.splice(to, 0, moved as BakeStep);
  return { ...state, steps };
}

/** Update a step definition in place (name/duration/temp note). */
export function updateStep(
  state: ToolState,
  stepId: string,
  patch: Partial<Omit<BakeStep, 'id'>>
): ToolState {
  const index = state.steps.findIndex((s) => s.id === stepId);
  if (index === -1) return state;
  const steps = [...state.steps];
  const current = steps[index] as BakeStep;
  const next: BakeStep = {
    ...current,
    ...patch,
    id: current.id,
    name: patch.name !== undefined ? patch.name.trim() || current.name : current.name,
    durationMs:
      patch.durationMs !== undefined ? normalizeDuration(patch.durationMs) : current.durationMs,
    tempNote: patch.tempNote !== undefined ? patch.tempNote : current.tempNote,
  };
  steps[index] = next;
  return { ...state, steps };
}

/** Reset every run to fresh (keeps step definitions and plan). */
export function resetAll(state: ToolState): ToolState {
  const runs: Record<string, StepRun> = {};
  for (const step of state.steps) runs[step.id] = emptyRun();
  return { ...state, runs, planStartedAt: null };
}

/** Total plan wall-clock time since the first start (or 0). */
export function totalElapsedMs(state: ToolState, now: number): number {
  if (state.planStartedAt === null || state.planStartedAt > now) return 0;
  return Math.max(0, now - state.planStartedAt);
}

/** Sum of all step durations as the planned total. */
export function plannedTotalMs(state: ToolState): number {
  return state.steps.reduce((sum, s) => sum + s.durationMs, 0);
}

/** Count steps currently counting down. */
export function activeStepCount(state: ToolState, now: number): number {
  return state.steps.filter((s) => isRunning(state.runs[s.id], s.durationMs, now)).length;
}

/** Format milliseconds as compact H:MM:SS (or M:SS under an hour). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** One-line plan summary used by the status bar and copy actions. */
export function summaryText(state: ToolState, now: number): string {
  const active = activeStepCount(state, now);
  return `${state.steps.length} steps · ${active} running · ${formatDuration(
    totalElapsedMs(state, now)
  )} elapsed`;
}
