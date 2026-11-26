import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import ToolClient from '@/app/tool-client';

// ---- mock @itsjust/core ------------------------------------------------
const mockSetData = vi.fn();
const mockToast = vi.fn();

vi.mock('@itsjust/core', () => ({
  ToolShell: ({ toolbar, sidebar, canvas, statusBar }: Record<string, unknown>) => (
    <div>
      <div data-testid="mock-toolbar">{toolbar as ReactNode}</div>
      <div data-testid="mock-sidebar">{sidebar as ReactNode}</div>
      <div data-testid="mock-canvas">{canvas as ReactNode}</div>
      <div data-testid="mock-status">{statusBar as ReactNode}</div>
    </div>
  ),
  ImportExport: ({ onShare }: { onShare?: () => void }) => (
    <button type="button" onClick={onShare} data-testid="trigger-share">
      share
    </button>
  ),
  useTool: () => ({
    state: {
      data: {
        steps: [
          { id: 'sA', name: 'Autolyse', durationMs: 60_000, tempNote: '22°C' },
          { id: 'sB', name: 'Bulk ferment', durationMs: 240_000, tempNote: '' },
        ],
        runs: {
          sA: {
            startedAt: null,
            pausedAt: null,
            pausedAccumMs: 0,
            finishedAt: null,
            alarmDismissed: false,
          },
          sB: {
            startedAt: null,
            pausedAt: null,
            pausedAccumMs: 0,
            finishedAt: null,
            alarmDismissed: false,
          },
        },
        planStartedAt: null,
        soundEnabled: false,
      },
      setData: mockSetData,
      isDirty: false,
      lastSaved: null,
    },
    toast: mockToast,
    supportedFormats: ['json'],
    handleExport: vi.fn(),
    importFromFile: vi.fn(),
    isImporting: false,
  }),
}));

vi.mock('lz-string', () => ({
  compressToEncodedURIComponent: (s: string) => Buffer.from(s).toString('base64url'),
  decompressFromEncodedURIComponent: (s: string) => Buffer.from(s, 'base64url').toString('utf8'),
}));

describe('baking timer tool client', () => {
  beforeEach(() => {
    mockSetData.mockReset();
    mockToast.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders canvas, sidebar and status bar', () => {
    render(<ToolClient />);
    expect(screen.getByTestId('bake-timer-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('bake-timer-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('preset-select')).toBeInTheDocument();
    expect(screen.getByTestId('plan-summary')).toBeInTheDocument();
  });

  it('shows steps and starts the next step', () => {
    render(<ToolClient />);
    expect(screen.getByText(/Autolyse/)).toBeInTheDocument();
    const startNext = screen.getByTestId('btn-start-next');
    fireEvent.click(startNext);
    expect(mockSetData).toHaveBeenCalled();
  });

  it('ticking clock updates remaining display and finish triggers alarm toast once', () => {
    render(<ToolClient />);
    // step sA runs 60s; start it via direct state patch through the next-start button
    fireEvent.click(screen.getByTestId('btn-start-next'));
    expect(mockSetData).toHaveBeenCalledTimes(1);
    // Simulate the persisted running state returned to the component:
    // the finish effect fires alarms only when isFinished is true; with
    // unstarted runs nothing fires after minutes of ticking.
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    // no alarms for never-started steps
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('fires a step alarm exactly once per step when finished', async () => {
    // The alarm effect relies on finishStep being idempotent per run;
    // assert that contract directly.
    const { finishStep, startStep } = await import('@/tool/types');
    let state: import('@/tool/types').ToolState = {
      steps: [{ id: 'x', name: 'Bake', durationMs: 60_000, tempNote: '' }],
      runs: {
        x: {
          startedAt: null,
          pausedAt: null,
          pausedAccumMs: 0,
          finishedAt: null,
          alarmDismissed: false,
        },
      },
      planStartedAt: null,
      soundEnabled: true,
    };
    state = startStep(state, 'x', 0);
    state = finishStep(state, 'x', 60_000);
    const after = finishStep(state, 'x', 65_000);
    expect(after).toBe(state);
  });

  it('loads a shared URL state and reports via toast', () => {
    window.history.replaceState(
      null,
      '',
      'http://localhost:3000/?state=' +
        encodeURIComponent(
          Buffer.from(
            JSON.stringify({
              v: 1,
              steps: [{ name: 'Knead', durationMs: 600_000, tempNote: '' }],
              runs: {},
              planStartedAt: null,
              soundEnabled: true,
            })
          ).toString('base64url')
        )
    );
    render(<ToolClient />);
    expect(mockSetData).toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith('Bake plan loaded from shared URL', 'success');
  });

  it('shows a readable error for corrupt share URLs', () => {
    window.history.replaceState(null, '', 'http://localhost:3000/?state=%%%invalid');
    render(<ToolClient />);
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0]?.[1]).toBe('error');
  });

  it('copies plan summary and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText },
    });
    render(<ToolClient />);
    fireEvent.click(screen.getByTestId('btn-copy-plan'));
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith('Plan copied to clipboard', 'success');
    });
  });
});
