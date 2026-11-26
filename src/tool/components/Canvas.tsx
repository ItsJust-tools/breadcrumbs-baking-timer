'use client';

import React from 'react';
import {
  activeStepCount,
  addStep,
  deleteStep,
  dismissAlarm,
  duplicateStep,
  formatDuration,
  isFinished,
  isPaused,
  isRunning,
  moveStep,
  pauseStep,
  plannedTotalMs,
  remainingMs,
  resetAll,
  resetStep,
  startStep,
  summaryText,
  totalElapsedMs,
  updateStep,
} from '../types';
import { PRESET_PLANS, presetSteps } from '../presets';
import { MINUTES, minutesToMs, msToMinutes } from '../ui-shared';
import type { BakeStep, ToolState } from '../types';

interface CanvasProps {
  state: ToolState;
  onChange?: (state: ToolState) => void;
  onSaveHistory?: (text: string) => void;
  now: number;
}

function StepCard({
  step,
  state,
  now,
  onChange,
  index,
  total,
}: {
  step: BakeStep;
  state: ToolState;
  now: number;
  onChange: (next: ToolState) => void;
  index: number;
  total: number;
}) {
  const run = state.runs[step.id];
  const running = isRunning(run, step.durationMs, now);
  const paused = isPaused(run);
  const finished = isFinished(run, step.durationMs, now);
  const remaining = remainingMs(run, step.durationMs, now);
  const flash = finished && !run?.alarmDismissed;

  const pct = Math.min(100, Math.round((1 - remaining / step.durationMs) * 100));

  return (
    <div
      data-testid={`step-card-${step.id}`}
      data-state={finished ? 'finished' : running ? 'running' : paused ? 'paused' : 'idle'}
      className={`rounded-lg border p-3 transition-colors ${
        flash
          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 animate-pulse'
          : running
            ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-900/10'
            : finished
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {index + 1}. {step.name}
          </h4>
          {step.tempNote ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{step.tempNote}</p>
          ) : null}
        </div>
        <div className="text-right">
          <span
            className="block font-mono text-2xl font-bold tabular-nums"
            data-testid={`remaining-${step.id}`}
          >
            {finished ? '0:00' : formatDuration(remaining)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
            of {formatDuration(step.durationMs)}
          </span>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
        <div
          className={`h-full rounded ${finished ? 'bg-green-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {flash ? (
        <p
          className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100"
          data-testid={`alarm-${step.id}`}
          role="alert"
        >
          ⏰ {step.name} finished!
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`${step.name} actions`}>
        {!finished && !running ? (
          <button
            type="button"
            data-testid={`btn-start-${step.id}`}
            onClick={() => onChange(startStep(state, step.id, Date.now()))}
            className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
          >
            {paused ? 'Resume' : 'Start'}
          </button>
        ) : null}
        {running ? (
          <button
            type="button"
            data-testid={`btn-pause-${step.id}`}
            onClick={() => onChange(pauseStep(state, step.id, Date.now()))}
            className="rounded bg-gray-200 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100"
          >
            Pause
          </button>
        ) : null}
        {run?.startedAt !== null && !running ? (
          <button
            type="button"
            data-testid={`btn-reset-${step.id}`}
            onClick={() => onChange(resetStep(state, step.id))}
            className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
          >
            Reset
          </button>
        ) : null}
        {flash ? (
          <button
            type="button"
            data-testid={`btn-dismiss-${step.id}`}
            onClick={() => onChange(dismissAlarm(state, step.id))}
            className="rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-700"
          >
            Dismiss
          </button>
        ) : null}
        <span className="grow" />
        <button
          type="button"
          data-testid={`btn-up-${step.id}`}
          aria-label={`Move ${step.name} up`}
          disabled={index === 0}
          onClick={() => onChange(moveStep(state, index, index - 1))}
          className="rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:opacity-40 dark:border-gray-700"
        >
          ↑
        </button>
        <button
          type="button"
          data-testid={`btn-down-${step.id}`}
          aria-label={`Move ${step.name} down`}
          disabled={index === total - 1}
          onClick={() => onChange(moveStep(state, index, index + 1))}
          className="rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:opacity-40 dark:border-gray-700"
        >
          ↓
        </button>
        <button
          type="button"
          data-testid={`btn-duplicate-${step.id}`}
          aria-label={`Duplicate ${step.name}`}
          onClick={() => onChange(duplicateStep(state, step.id))}
          className="rounded border border-gray-200 px-1.5 py-0.5 text-xs dark:border-gray-700"
        >
          Duplicate
        </button>
        <button
          type="button"
          data-testid={`btn-del-${step.id}`}
          aria-label={`Remove ${step.name}`}
          onClick={() => onChange(deleteStep(state, step.id))}
          className="rounded border border-red-200 px-1.5 py-0.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300"
        >
          Delete
        </button>
      </div>
      <StepEditor step={step} state={state} onChange={onChange} />
    </div>
  );
}

function StepEditor({
  step,
  state,
  onChange,
}: {
  step: BakeStep;
  state: ToolState;
  onChange: (next: ToolState) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(step.name);
  const [minutes, setMinutes] = React.useState(String(msToMinutes(step.durationMs)));
  const [tempNote, setTempNote] = React.useState(step.tempNote);

  if (!editing) {
    return (
      <button
        type="button"
        data-testid={`btn-edit-${step.id}`}
        onClick={() => setEditing(true)}
        className="mt-2 text-xs text-gray-500 underline dark:text-gray-400"
      >
        Edit step
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2 rounded border border-dashed border-gray-300 p-2 dark:border-gray-700">
      <input
        data-testid={`edit-name-${step.id}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Step name"
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
      />
      <div className="flex gap-2">
        <input
          data-testid={`edit-minutes-${step.id}`}
          value={minutes}
          inputMode="numeric"
          onChange={(e) => setMinutes(e.target.value)}
          className="w-24 rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
        />
        <span className="self-center text-xs text-gray-500">{MINUTES}</span>
        <input
          data-testid={`edit-temp-${step.id}`}
          value={tempNote}
          onChange={(e) => setTempNote(e.target.value)}
          placeholder="Temperature note"
          className="grow rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid={`btn-save-${step.id}`}
          onClick={() => {
            onChange(
              updateStep(state, step.id, {
                name,
                durationMs: minutesToMs(Number(minutes) || 1),
                tempNote,
              })
            );
            setEditing(false);
          }}
          className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export const Canvas: React.FC<CanvasProps> = ({ state, onChange, now }) => {
  const change = (next: ToolState) => onChange?.(next);
  const [newName, setNewName] = React.useState('');
  const [newMinutes, setNewMinutes] = React.useState('30');
  const [newTemp, setNewTemp] = React.useState('');

  const handleAdd = () => {
    change(
      addStep(state, {
        name: newName,
        durationMs: minutesToMs(Number(newMinutes) || 1),
        tempNote: newTemp,
      })
    );
    setNewName('');
    setNewTemp('');
  };

  return (
    <div className="p-4 space-y-6 overflow-y-auto h-full" data-testid="bake-timer-canvas">
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
        data-testid="plan-overview"
      >
        <div data-testid="plan-summary">
          <span className="font-mono text-lg font-bold">
            {formatDuration(totalElapsedMs(state, now))}
          </span>
          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
            total elapsed · plan {formatDuration(plannedTotalMs(state))} · {summaryText(state, now)}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="btn-start-next"
            onClick={() => {
              const next = state.steps.find(
                (s) =>
                  !isRunning(state.runs[s.id], s.durationMs, now) &&
                  state.runs[s.id]?.startedAt === null
              );
              if (next) change(startStep(state, next.id, Date.now()));
            }}
            className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            Start next step
          </button>
          <button
            type="button"
            data-testid="btn-reset-all"
            onClick={() => change(resetAll(state))}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs dark:border-gray-700"
          >
            Reset plan
          </button>
        </div>
      </div>

      {state.steps.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="empty-plan">
          No steps yet — add one below or load a preset from the toolbar.
        </p>
      ) : (
        <div className="space-y-3" data-testid="step-list">
          {state.steps.map((step, i) => (
            <StepCard
              key={step.id}
              step={step}
              state={state}
              now={now}
              onChange={change}
              index={i}
              total={state.steps.length}
            />
          ))}
        </div>
      )}

      {activeStepCount(state, now) > 0 ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-900/20"
          data-testid="timeline-view"
        >
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
            Running in parallel: {activeStepCount(state, now)}
          </h3>
          <ul className="space-y-0.5 text-xs">
            {state.steps
              .filter((s) => isRunning(state.runs[s.id], s.durationMs, now))
              .map((s) => (
                <li key={s.id} className="font-mono">
                  {s.name} — {formatDuration(remainingMs(state.runs[s.id], s.durationMs, now))} left
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div
        className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/50"
        data-testid="add-step-form"
      >
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Add step
        </h3>
        <div className="flex flex-wrap gap-2">
          <input
            data-testid="new-step-name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Bulk ferment"
            className="w-48 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <input
            data-testid="new-step-minutes"
            value={newMinutes}
            inputMode="numeric"
            onChange={(e) => setNewMinutes(e.target.value)}
            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
            aria-label="Duration in minutes"
          />
          <input
            data-testid="new-step-temp"
            value={newTemp}
            onChange={(e) => setNewTemp(e.target.value)}
            placeholder="Temperature note (optional)"
            className="w-56 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
          <button
            type="button"
            data-testid="btn-add-step"
            onClick={handleAdd}
            className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            Add step
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        {state.steps.length} step{state.steps.length === 1 ? '' : 's'} in plan · sound{' '}
        {state.soundEnabled ? 'on' : 'off'}
      </p>
    </div>
  );
};

export { PRESET_PLANS, presetSteps };
