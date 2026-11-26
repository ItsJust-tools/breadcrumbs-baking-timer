'use client';

import React from 'react';
import type { ToolState } from '../types';
import { formatDuration, plannedTotalMs, totalElapsedMs } from '../types';
import { PRESET_PLANS } from '../presets';

interface SidebarProps {
  state: ToolState;
  onChange: (next: ToolState) => void;
  now: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ state, now }) => {
  const finishedCount = state.steps.filter((s) => state.runs[s.id]?.finishedAt !== null).length;

  return (
    <div className="p-4 space-y-6 text-sm overflow-y-auto h-full" data-testid="bake-timer-sidebar">
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Plan overview</h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          <li data-testid="sidebar-step-count">
            {state.steps.length} step{state.steps.length === 1 ? '' : 's'} in plan
          </li>
          <li>{finishedCount} finished</li>
          <li>Planned total: {formatDuration(plannedTotalMs(state))}</li>
          <li>Elapsed: {formatDuration(totalElapsedMs(state, now))}</li>
          <li>Sound alarms: {state.soundEnabled ? 'on' : 'off'}</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Included presets</h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          {PRESET_PLANS.map((p) => (
            <li key={p.id}>
              {p.emoji} {p.name} — {p.steps.length} steps
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">How it works</h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          <li>Start any step with its Start button; steps run in parallel.</li>
          <li>Each step alarms and flashes when its countdown reaches zero.</li>
          <li>
            Reorder, duplicate or delete steps at any time — running steps keep their elapsed time.
          </li>
          <li>Your plan and running timers are saved in this browser and survive a reload.</li>
          <li>Use Share in the toolbar to encode the whole plan into a URL.</li>
        </ul>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Alarms use your browser notifications; keep this tab open while baking for audio alerts.
      </p>
    </div>
  );
};
