import { describe, it, expect } from 'vitest';
import {
  serializeState,
  deserializeState,
  roundTrips,
  breadcrumbsBakingTimerTool,
} from '@/tool/tool-definition';
import { emptyRun, startStep, finishStep, type ToolState } from '@/tool/types';

const MIN = 60_000;

function buildRunningState(): ToolState {
  let state: ToolState = {
    steps: [
      { id: 'a', name: 'Autolyse', durationMs: 30 * MIN, tempNote: '22°C' },
      { id: 'b', name: 'Bulk ferment', durationMs: 90 * MIN, tempNote: '26°C' },
      { id: 'c', name: 'Bake', durationMs: 5 * MIN, tempNote: '' },
    ],
    runs: { a: emptyRun(), b: emptyRun(), c: emptyRun() },
    planStartedAt: null,
    soundEnabled: true,
  };
  state = startStep(state, 'a', 1_000);
  state = startStep(state, 'b', 2_000);
  return state;
}

describe('share URL round-trip', () => {
  it('serializes to compact JSON and restores the same plan', () => {
    const state = buildRunningState();
    const json = serializeState(state);
    // compact: steps store no ids
    expect(json).not.toContain('"id"');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Array.isArray(parsed.steps)).toBe(true);

    const restored = deserializeState(JSON.parse(json), 61_000);
    expect(restored.success).toBe(true);
    if (!restored.success) throw new Error('unreachable');
    expect(restored.data.steps.map((s) => s.name)).toEqual(['Autolyse', 'Bulk ferment', 'Bake']);
    expect(restored.data.steps[0]?.durationMs).toBe(30 * MIN);
    expect(restored.data.steps[0]?.tempNote).toBe('22°C');
    expect(restored.data.soundEnabled).toBe(true);
  });

  it('preserves running elapsed time across the round trip', () => {
    const state = buildRunningState();
    const restored = deserializeState(JSON.parse(serializeState(state)), 61_000);
    expect(restored.success).toBe(true);
    if (!restored.success) throw new Error('unreachable');
    const a = restored.data.steps[0] as NonNullable<(typeof restored.data.steps)[number]>;
    const runA = restored.data.runs[a.id];
    expect(runA?.startedAt).toBe(1_000);
    expect(runA?.finishedAt).toBeNull();
  });

  it('preserves finishedAt and alarm state across the round trip', () => {
    let state = buildRunningState();
    state = startStep(state, 'c', 100);
    state = finishStep(state, 'c', 999);
    state = {
      ...state,
      runs: {
        ...state.runs,
        c: { ...(state.runs.c as NonNullable<typeof state.runs.c>), alarmDismissed: true },
      },
    };
    const restored = deserializeState(JSON.parse(serializeState(state)), 5_000);
    if (!restored.success) throw new Error('unreachable');
    const c = restored.data.steps[2] as NonNullable<(typeof restored.data.steps)[number]>;
    expect(restored.data.runs[c.id]?.finishedAt).toBe(999);
    expect(restored.data.runs[c.id]?.alarmDismissed).toBe(true);
    // idle step stays idle
    const a = restored.data.steps[0] as NonNullable<(typeof restored.data.steps)[number]>;
    expect(restored.data.runs[a.id]?.startedAt).toBe(1_000);
  });

  it('roundTrips accepts a good state and normalizes ids', () => {
    expect(roundTrips(buildRunningState(), 61_000)).toBe(true);
    expect(
      roundTrips({ steps: [], runs: {}, planStartedAt: null, soundEnabled: false }, 1_000)
    ).toBe(true);
  });

  it('rejects non-object payloads', () => {
    expect(deserializeState('nope').success).toBe(false);
    expect(deserializeState(null).success).toBe(false);
    expect(deserializeState([1, 2]).success).toBe(false);
    expect(deserializeState({}).success).toBe(false);
    expect(deserializeState({ steps: 'x' }).success).toBe(false);
    expect(deserializeState({ steps: [] }).success).toBe(true);
  });

  it('recovers gracefully from corrupted steps', () => {
    const result = deserializeState({ steps: [null, 'junk', { name: '  ', durationMs: -5 }] }, 100);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.steps).toHaveLength(1);
    expect(result.data.steps[0]?.name).toBe('Untitled step');
    expect(result.data.steps[0]?.durationMs).toBeGreaterThanOrEqual(1000);
  });

  it('sanitizes run payloads and clamps negative timestamps', () => {
    const result = deserializeState(
      {
        steps: [{ name: 'A', durationMs: 60_000 }],
        runs: {
          '0': {
            startedAt: -5,
            pausedAt: -1,
            pausedAccumMs: -3,
            finishedAt: 'x',
            alarmDismissed: 'yes',
          },
        },
        planStartedAt: -9,
        soundEnabled: 'nope',
      },
      100
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    const run = result.data.runs[result.data.steps[0]?.id as string];
    expect(run?.startedAt).toBeNull();
    expect(run?.pausedAt).toBeNull();
    expect(run?.pausedAccumMs).toBe(0);
    expect(run?.finishedAt).toBeNull();
    expect(run?.alarmDismissed).toBe(false);
    expect(result.data.planStartedAt).toBeNull();
    expect(result.data.soundEnabled).toBe(true);
  });

  it('drops run entries for steps beyond MAX cap and orphans', () => {
    const steps = Array.from({ length: 30 }, (_, i) => ({ name: `S${i}`, durationMs: 60_000 }));
    const runs: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) runs[String(i)] = { startedAt: 1 };
    runs['99'] = { startedAt: 2 }; // orphan index
    const result = deserializeState({ steps, runs }, 100);
    if (!result.success) throw new Error('unreachable');
    expect(result.data.steps.length).toBeLessThanOrEqual(24);
    expect(Object.keys(result.data.runs).length).toBe(result.data.steps.length);
  });

  it('tool exposes serialize/deserialize bound to the same format', () => {
    const state = buildRunningState();
    const restored = breadcrumbsBakingTimerTool.deserialize(
      JSON.parse(breadcrumbsBakingTimerTool.serialize(state))
    );
    expect(restored.success).toBe(true);
    expect(breadcrumbsBakingTimerTool.id).toBe('breadcrumbs-baking-timer');
    expect(breadcrumbsBakingTimerTool.initialState.steps).toEqual([]);
  });
});
