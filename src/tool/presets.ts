import type { BakeStep } from './types';

/** A curated starter plan. Durations are in minutes. */
export interface PresetPlan {
  id: string;
  name: string;
  emoji: string;
  steps: { name: string; minutes: number; tempNote: string }[];
}

const min = (m: number) => m * 60 * 1000;

export const PRESET_PLANS: PresetPlan[] = [
  {
    id: 'bread',
    name: 'Sourdough-style bread',
    emoji: '🍞',
    steps: [
      { name: 'Autolyse', minutes: 45, tempNote: 'Covered, room temp ~22°C' },
      { name: 'Bulk ferment', minutes: 240, tempNote: '25–26°C dough temp' },
      { name: 'Shape', minutes: 15, tempNote: 'Lightly floured bench' },
      { name: 'Proof', minutes: 120, tempNote: '26°C, covered banneton' },
      { name: 'Bake', minutes: 45, tempNote: '230°C, covered first 20 min' },
    ],
  },
  {
    id: 'pizza',
    name: 'Pizza dough',
    emoji: '🍕',
    steps: [
      { name: 'Mix & rest', minutes: 20, tempNote: 'Room temp' },
      { name: 'Bulk ferment', minutes: 120, tempNote: '24°C' },
      { name: 'Ball & proof', minutes: 180, tempNote: 'Room temp or fridge overnight' },
      { name: 'Bake', minutes: 8, tempNote: 'Max oven temp, preheated steel' },
    ],
  },
  {
    id: 'croissants',
    name: 'Croissants',
    emoji: '🥐',
    steps: [
      { name: 'Laminate', minutes: 60, tempNote: 'Keep butter at 13°C' },
      { name: 'Chill', minutes: 60, tempNote: 'Fridge 4°C between turns' },
      { name: 'Shape', minutes: 30, tempNote: 'Cold dough only' },
      { name: 'Final proof', minutes: 150, tempNote: '24°C, not warmer' },
      { name: 'Bake', minutes: 18, tempNote: '200°C fan' },
    ],
  },
  {
    id: 'banana-bread',
    name: 'Banana bread',
    emoji: '🍌',
    steps: [
      { name: 'Prep & mix', minutes: 15, tempNote: 'Room-temp butter' },
      { name: 'Rest batter', minutes: 10, tempNote: 'Optional, lets flour hydrate' },
      { name: 'Bake', minutes: 60, tempNote: '175°C, toothpick test' },
      { name: 'Cool', minutes: 30, tempNote: 'In pan 10 min, then rack' },
    ],
  },
];

/** Convert a preset into step definitions with millisecond durations. */
export function presetSteps(preset: PresetPlan): BakeStep[] {
  return preset.steps.map((s) => ({
    id: `s-${preset.id}-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    name: s.name,
    durationMs: min(s.minutes),
    tempNote: s.tempNote,
  }));
}
