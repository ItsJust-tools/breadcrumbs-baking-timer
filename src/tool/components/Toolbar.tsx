'use client';

import React from 'react';
import type { ToolState } from '../types';
import { PRESET_PLANS, presetSteps } from '../presets';
import { emptyRun } from '../types';

interface ToolbarProps {
  state: ToolState;
  onChange: (next: ToolState) => void;
  onClear: () => void;
  onCopy?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({ state, onChange, onClear, onCopy }) => {
  const loadPreset = (presetId: string) => {
    const preset = PRESET_PLANS.find((p) => p.id === presetId);
    if (!preset) return;
    const steps = presetSteps(preset);
    const runs: ToolState['runs'] = {};
    for (const step of steps) runs[step.id] = emptyRun();
    onChange({ ...state, steps, runs, planStartedAt: null });
  };

  const toggleSound = () => {
    onChange({ ...state, soundEnabled: !state.soundEnabled });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="Bake timer controls"
      >
        <label
          className="text-xs font-medium text-gray-600 dark:text-gray-300"
          htmlFor="preset-select"
        >
          Preset:
        </label>
        <select
          id="preset-select"
          data-testid="preset-select"
          value=""
          onChange={(e) => {
            if (e.target.value) loadPreset(e.target.value);
          }}
          className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800"
        >
          <option value="">Load a preset plan…</option>
          {PRESET_PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji} {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={toggleSound}
          data-testid="btn-toggle-sound"
          aria-pressed={state.soundEnabled}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {state.soundEnabled ? '🔊 Sound on' : '🔇 Sound off'}
        </button>
        <button
          type="button"
          onClick={onClear}
          data-testid="btn-clear"
          className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Clear plan
        </button>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            data-testid="btn-copy-plan"
            className="rounded-md bg-amber-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            Copy plan summary
          </button>
        ) : null}
      </div>
    </div>
  );
};
