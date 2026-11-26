import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATE,
  MAX_STEPS,
  MIN_DURATION_MS,
  emptyRun,
  elapsedMs,
  remainingMs,
  isFinished,
  isRunning,
  isPaused,
  finishStep,
  startStep,
  pauseStep,
  resetStep,
  dismissAlarm,
  addStep,
  duplicateStep,
  deleteStep,
  moveStep,
  updateStep,
  resetAll,
  totalElapsedMs,
  plannedTotalMs,
  activeStepCount,
  formatDuration,
  summaryText,
  type ToolState,
} from '@/tool/types';
import { serializeState, deserializeState, roundTrips } from '@/tool/tool-definition';
import { PRESET_PLANS, presetSteps } from '@/tool/presets';

const MIN = 60_000;

function seededState(overrides: Partial<ToolState> = {}): ToolState {
  return {
    ...DEFAULT_STATE,
    steps: [
      { id: 'a', name: 'Autolyse', durationMs: 30 * MIN, tempNote: '22°C' },
      { id: 'b', name: 'Bulk ferment', durationMs: 90 * MIN, tempNote: '' },
    ],
    runs: { a: emptyRun(), b: emptyRun() },
    ...overrides,
  };
}

describe('countdown math', () => {
  it('computes elapsed and remaining from wall clock', () => {
    const run = { ...emptyRun(), startedAt: 1000, pausedAccumMs: 0 };
    expect(elapsedMs(run, 61_000)).toBe(60_000);
    expect(remainingMs(run, 5 * MIN, 61_000)).toBe(4 * MIN);
  });

  it('returns 0 elapsed before a step starts', () => {
    expect(elapsedMs(undefined, 1_000)).toBe(0);
    expect(elapsedMs(emptyRun(), 1_000)).toBe(0);
  });

  it('counts pauses against elapsed time', () => {
    // ran 30s, paused 60s at t=30, banked the pause on resume
    const run = { ...emptyRun(), startedAt: 0, pausedAt: null, pausedAccumMs: 60_000 };
    expect(elapsedMs(run, 90_000)).toBe(30_000);
  });

  it('freezes elapsed at pause moment while paused', () => {
    const run = { ...emptyRun(), startedAt: 0, pausedAt: 30_000, pausedAccumMs: 0 };
    expect(elapsedMs(run, 90_000)).toBe(30_000);
    expect(isPaused(run)).toBe(true);
    expect(isRunning(run, 5 * MIN, 90_000)).toBe(false);
  });

  it('marks finished exactly at duration and counts down to zero', () => {
    const run = { ...emptyRun(), startedAt: 0 };
    expect(isFinished(run, 60_000, 59_999)).toBe(false);
    expect(isFinished(run, 60_000, 60_000)).toBe(true);
    expect(remainingMs(run, 60_000, 120_000)).toBe(0);
  });

  it('finishStep sets finishedAt once and never re-fires', () => {
    let state = seededState();
    state = startStep(state, 'a', 0);
    state = finishStep(state, 'a', 60_000);
    expect(state.runs.a?.finishedAt).toBe(60_000);
    const again = finishStep(state, 'a', 999_000);
    expect(again).toBe(state);
    expect(state.runs.a?.finishedAt).toBe(60_000);
  });

  it('finishStep is a no-op for unknown, unstarted or already-finished steps', () => {
    const state = seededState();
    expect(finishStep(state, 'zzz', 1)).toBe(state);
    expect(finishStep(state, 'a', 1)).toBe(state); // not started
  });
});

describe('start / pause / reset', () => {
  it('startStep sets startedAt once and planStartedAt on first start', () => {
    let state = seededState();
    expect(state.planStartedAt).toBeNull();
    state = startStep(state, 'a', 5_000);
    expect(state.runs.a?.startedAt).toBe(5_000);
    expect(state.planStartedAt).toBe(5_000);
    state = startStep(state, 'b', 7_000);
    expect(state.runs.b?.startedAt).toBe(7_000);
    expect(state.planStartedAt).toBe(5_000);
  });

  it('starting a running step is a no-op', () => {
    let state = seededState();
    state = startStep(state, 'a', 1_000);
    expect(startStep(state, 'a', 9_000)).toBe(state);
  });

  it('resume banks the paused interval so countdown continues', () => {
    let state = seededState();
    state = startStep(state, 'a', 0);
    state = pauseStep(state, 'a', 30_000);
    state = {
      ...state,
      runs: {
        ...state.runs,
        a: { ...(state.runs.a as NonNullable<typeof state.runs.a>), startedAt: 0 },
      },
    };
    const resumed = startStep(state, 'a', 120_000);
    // 30s ran + 90s paused → only 30s elapsed at t=120s
    expect(elapsedMs(resumed.runs.a, 120_000)).toBe(30_000);
    expect(isRunning(resumed.runs.a, 5 * MIN, 120_000)).toBe(true);
  });

  it('pauseStep is a no-op when idle, finished or already paused', () => {
    const idle = seededState();
    expect(pauseStep(idle, 'a', 1)).toBe(idle);
    let state = startStep(seededState(), 'a', 0);
    state = finishStep(state, 'a', 60_000);
    expect(pauseStep(state, 'a', 61_000)).toBe(state);
    const paused = pauseStep(startStep(seededState(), 'a', 0), 'a', 10_000);
    expect(pauseStep(paused, 'a', 20_000)).toBe(paused);
  });

  it('resetStep returns the run to fresh without touching others', () => {
    let state = seededState();
    state = startStep(state, 'a', 0);
    state = startStep(state, 'b', 0);
    state = resetStep(state, 'a');
    expect(state.runs.a).toEqual(emptyRun());
    expect(state.runs.b?.startedAt).toBe(0);
  });

  it('resetAll wipes runs and planStartedAt but keeps steps', () => {
    let state = seededState();
    state = startStep(state, 'a', 0);
    state = resetAll(state);
    expect(state.steps).toHaveLength(2);
    expect(state.planStartedAt).toBeNull();
    expect(state.runs.a).toEqual(emptyRun());
    expect(state.runs.b).toEqual(emptyRun());
  });
});

describe('alarm dismissal', () => {
  it('dismiss marks the run and hides the flash', () => {
    let state = seededState();
    state = startStep(state, 'a', 0);
    state = finishStep(state, 'a', 60_000);
    expect(state.runs.a?.alarmDismissed).toBe(false);
    state = dismissAlarm(state, 'a');
    expect(state.runs.a?.alarmDismissed).toBe(true);
    expect(dismissAlarm(state, 'a')).toBe(state);
  });
});

describe('plan edits preserve running progress', () => {
  it('reordering keeps runs keyed by id with elapsed time intact', () => {
    let state = seededState();
    state = startStep(state, 'b', 0);
    const before = elapsedMs(state.runs.b, 45_000);
    const moved = moveStep(state, 1, 0);
    expect(moved.steps[0]?.id).toBe('b');
    expect(elapsedMs(moved.runs.b, 45_000)).toBe(before);
    expect(elapsedMs(state.runs.b, 45_000)).toBe(before);
  });

  it('deleting a step keeps other steps running untouched', () => {
    let state = seededState();
    state = startStep(state, 'b', 0);
    state = startStep(state, 'a', 0);
    const cut = deleteStep(state, 'a');
    expect(cut.steps.map((s) => s.id)).toEqual(['b']);
    expect(cut.runs.a).toBeUndefined();
    expect(elapsedMs(cut.runs.b, 30_000)).toBe(30_000);
    expect(elapsedMs(state.runs.a, 30_000)).toBe(30_000); // original untouched
  });

  it('deleting an unknown step is a no-op', () => {
    const state = seededState();
    expect(deleteStep(state, 'nope')).toBe(state);
    expect(moveStep(state, 0, 5)).toBe(state);
    expect(moveStep(state, -1, 0)).toBe(state);
  });

  it('addStep appends and duplicateStep copies next to the source', () => {
    const state = seededState();
    const added = addStep(state, { name: '  Proof  ', durationMs: 120 * MIN, tempNote: '26°C' });
    expect(added.steps).toHaveLength(3);
    expect(added.steps[2]?.name).toBe('Proof');
    expect(added.runs[added.steps[2]!.id]).toEqual(emptyRun());
    expect(added.steps[0]!.id).toBe('a');

    const dup = duplicateStep(added, 'a');
    expect(dup.steps[1]?.name).toBe('Autolyse (copy)');
    expect(dup.steps[1]?.id).not.toBe('a');
    expect(dup.runs[dup.steps[1]!.id]).toEqual(emptyRun());
  });

  it('updateStep clamps duration and preserves the id', () => {
    const state = seededState();
    const next = updateStep(state, 'a', { name: '  ', durationMs: 0.5, tempNote: 'cold' });
    expect(next.steps[0]?.id).toBe('a');
    expect(next.steps[0]?.name).toBe('Autolyse'); // blank name keeps existing
    expect(next.steps[0]?.durationMs).toBe(MIN_DURATION_MS);
    expect(next.steps[0]?.tempNote).toBe('cold');
    expect(updateStep(state, 'zz', { name: 'x' })).toBe(state);
  });

  it('MAX_STEPS caps the plan', () => {
    let state: ToolState = { ...DEFAULT_STATE };
    for (let i = 0; i < MAX_STEPS; i++) {
      state = addStep(state, { name: `Step ${i}`, durationMs: MIN });
    }
    expect(state.steps).toHaveLength(MAX_STEPS);
    expect(addStep(state, { name: 'over', durationMs: MIN })).toBe(state);
    expect(duplicateStep(state, state.steps[0]?.id as string)).toBe(state);
  });
});

describe('summaries', () => {
  it('totalElapsedMs measures from planStartedAt', () => {
    let state = seededState();
    expect(totalElapsedMs(state, 99_000)).toBe(0);
    state = startStep(state, 'a', 10_000);
    expect(totalElapsedMs(state, 70_000)).toBe(60_000);
  });

  it('plannedTotalMs and formatDuration', () => {
    expect(plannedTotalMs(seededState())).toBe(120 * MIN);
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(59_999)).toBe('0:59');
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('activeStepCount and summaryText', () => {
    let state = seededState();
    state = startStep(state, 'a', 0);
    state = startStep(state, 'b', 0);
    expect(activeStepCount(state, 1_000)).toBe(2);
    state = finishStep(state, 'a', 30 * MIN);
    expect(activeStepCount(state, 30 * MIN + 1)).toBe(1);
    expect(summaryText(state, 30 * MIN + 1)).toContain('1 running');
  });
});

describe('preset plans', () => {
  it('exposes the four curated plans with valid steps', () => {
    expect(PRESET_PLANS.map((p) => p.id)).toEqual(['bread', 'pizza', 'croissants', 'banana-bread']);
    for (const preset of PRESET_PLANS) {
      const steps = presetSteps(preset);
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.durationMs).toBeGreaterThanOrEqual(MIN_DURATION_MS);
        expect(step.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('preset steps have unique ids', () => {
    const steps = presetSteps(PRESET_PLANS[0] as (typeof PRESET_PLANS)[number]);
    const ids = new Set(steps.map((s) => s.id));
    expect(ids.size).toBe(steps.length);
  });
});
