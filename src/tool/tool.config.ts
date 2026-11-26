import type { FeatureFlags, ExportFormat } from '@itsjust/core';

export const templateBaseVersion = '1.4.0';

export const toolConfig = {
  id: 'breadcrumbs-baking-timer',
  name: 'Breadcrumbs Baking Timer',
  description:
    'A step-by-step multi-timer for home bakers that tracks parallel proof/knead/bake stages with per-step alarms and a shareable bake plan.',
  version: '1.0.0',
  exportFormats: ['png', 'jpeg', 'webp', 'pdf', 'json'] as ExportFormat[],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  } as FeatureFlags,
  theme: {
    accent: '#d97706',
    accentHover: '#b45309',
    accentSubtle: 'rgba(217, 119, 6, 0.15)',
    brand: 'Breadcrumbs Baking Timer',
    icon: '🍞',
  },
};

export default toolConfig;
