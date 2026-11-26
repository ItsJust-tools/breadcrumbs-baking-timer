'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { ToolShell, useTool, ImportExport } from '@itsjust/core';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { toolConfig, templateBaseVersion, Canvas, Toolbar, Sidebar } from '@/tool';
import { breadcrumbsBakingTimerTool } from '@/tool/tool-definition';
import { finishStep, isFinished, summaryText } from '@/tool/types';
import type { ToolState } from '@/tool/types';

/**
 * Interval used for the ticking clock. One second keeps countdowns smooth
 * without excessive re-renders.
 */
const TICK_MS = 1000;

/** Audio alarm when a step finishes (respects state.soundEnabled). */
function playAlarm(url: string, soundEnabled: boolean): void {
  if (!soundEnabled) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const beepAt = (start: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.45);
      void url;
    };
    beepAt(0);
    beepAt(0.5);
    beepAt(1);
    oscCleanup(ctx);
  } catch {
    // Audio unavailable (headless tests, permissions); ignore.
  }
}

function oscCleanup(ctx: AudioContext): void {
  window.setTimeout(() => void ctx.close().catch(() => undefined), 2000);
}

export default function ToolClient() {
  const ToolShellCompat = ToolShell as unknown as ComponentType<Record<string, unknown>> & {
    Toolbar?: ComponentType<{ children?: ReactNode }>;
    Body?: ComponentType<{ children?: ReactNode }>;
    Sidebar?: ComponentType<{ children?: ReactNode }>;
    Canvas?: ComponentType<{ children?: ReactNode }>;
    StatusBar?: ComponentType<{ children?: ReactNode }>;
  };
  const canvasRef = useRef<HTMLDivElement>(null);
  const tool = useTool<ToolState>(breadcrumbsBakingTimerTool, canvasRef);
  const setToolData = tool.state.setData;
  const showToast = tool.toast;
  const [isSharing, setIsSharing] = useState(false);
  const hasLoadedSharedState = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth > 768 && toolConfig.features.sidebar
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const announcedRef = useRef<Set<string>>(new Set());

  const title = toolConfig.name;
  const state = tool.state.data;

  // Ticking clock drives all countdown displays. The interval callback (not
  // the effect body) performs the state update.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const handleStateChange = useCallback(
    (updater: (prev: ToolState) => ToolState) => {
      setToolData(updater);
    },
    [setToolData]
  );

  // Fire alarms (notification + sound) exactly once per finished step.
  useEffect(() => {
    for (const step of state.steps) {
      const run = state.runs[step.id];
      if (isFinished(run, step.durationMs, now) && !run?.alarmDismissed) {
        if (!announcedRef.current.has(step.id)) {
          announcedRef.current.add(step.id);
          playAlarm('/icon.svg', state.soundEnabled);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification(`${step.name} finished!`, {
                body: 'Your baking timer step is done.',
              });
            } catch {
              // Notification failures are non-fatal.
            }
          }
          showToast(`${step.name} finished!`, 'success');
        }
      }
      if (run?.finishedAt === null || run?.finishedAt === undefined || run?.alarmDismissed) {
        if (run?.alarmDismissed) announcedRef.current.delete(step.id);
      }
    }
  }, [state, now, showToast]);

  // Request notification permission on first interaction (best-effort).
  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const handler = () => {
        void Notification.requestPermission().catch(() => undefined);
        window.removeEventListener('pointerdown', handler);
      };
      window.addEventListener('pointerdown', handler, { once: true });
      return () => window.removeEventListener('pointerdown', handler);
    }
    return undefined;
  }, []);

  // Keep finished steps persisted with their finishedAt timestamps.
  useEffect(() => {
    const pending = state.steps.filter(
      (s) =>
        isFinished(state.runs[s.id], s.durationMs, now) &&
        state.runs[s.id]?.finishedAt === null &&
        state.runs[s.id]?.startedAt !== null
    );
    if (pending.length === 0) return;
    let next = state;
    for (const step of pending) {
      next = finishStep(next, step.id, now);
    }
    setToolData(() => next);
  }, [state, now, setToolData]);

  useEffect(() => {
    if (hasLoadedSharedState.current) return;
    hasLoadedSharedState.current = true;
    const params = new URLSearchParams(window.location.search);
    const encodedState = params.get('state');
    if (!encodedState) return;
    try {
      const serialized = decompressFromEncodedURIComponent(encodedState);
      if (!serialized) throw new Error('Invalid shared URL');
      const parsed: unknown = JSON.parse(serialized);
      const deserialized = breadcrumbsBakingTimerTool.deserialize(parsed);
      if (!deserialized.success) throw new Error(deserialized.error);
      setToolData(deserialized.data);
      showToast('Bake plan loaded from shared URL', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load shared URL';
      showToast(message, 'error');
    }
  }, [setToolData, showToast]);

  const handleCopy = useCallback(async () => {
    const lines = [
      `${title} — bake plan`,
      ...state.steps.map(
        (s, i) =>
          `${i + 1}. ${s.name} — ${Math.round(s.durationMs / 60000)} min${
            s.tempNote ? ` (${s.tempNote})` : ''
          }${
            state.runs[s.id]?.finishedAt !== null
              ? ' ✓'
              : state.runs[s.id]?.startedAt !== null
                ? ' ▶'
                : ''
          }`
      ),
      summaryText(state, Date.now()),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      showToast('Plan copied to clipboard', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy plan';
      showToast(message, 'error');
    }
  }, [showToast, state, title]);

  const handleShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const serialized = breadcrumbsBakingTimerTool.serialize(state);
      const encodedState = compressToEncodedURIComponent(serialized);
      if (!encodedState) throw new Error('Failed to encode plan for URL');
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set('state', encodedState);
      url.searchParams.set('tool', toolConfig.id);
      window.history.replaceState(null, '', url.toString());

      const shareUrl = url.toString();
      if (navigator.share) {
        try {
          await navigator.share({ title, url: shareUrl });
          showToast('Share URL ready', 'success');
          return;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') return;
        }
      }
      await navigator.clipboard.writeText(shareUrl);
      showToast('Share URL copied to clipboard', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create share URL';
      showToast(message, 'error');
    } finally {
      setIsSharing(false);
    }
  }, [showToast, state, title]);

  const toolbarContent = (
    <>
      <Toolbar
        state={state}
        onChange={(next) => setToolData(() => next)}
        onClear={() =>
          setToolData((prev) => ({ ...prev, steps: [], runs: {}, planStartedAt: null }))
        }
        onCopy={() => void handleCopy()}
      />
      <ImportExport
        formats={tool.supportedFormats}
        onExport={tool.handleExport}
        onImport={tool.importFromFile}
        isImporting={tool.isImporting}
        onShare={handleShare}
        isSharing={isSharing}
      />
    </>
  );

  const sidebarContent = (
    <Sidebar state={state} onChange={(next) => setToolData(() => next)} now={now} />
  );

  const canvasContent = (
    <div ref={canvasRef}>
      <Canvas state={state} onChange={(next) => setToolData(() => next)} now={now} />
    </div>
  );

  const statusBarContent = (
    <>
      <span
        className={`status-slot status-slot-state ${tool.state.isDirty ? 'status-unsaved' : 'status-saved'}`}
      >
        {tool.state.isDirty ? (
          <>
            <span className="status-saving-dot" />
            Unsaved
          </>
        ) : tool.state.lastSaved ? (
          <>Saved {tool.state.lastSaved}</>
        ) : (
          'Ready'
        )}
      </span>
      <span className="status-slot status-slot-steps">{state.steps.length} steps</span>
      <span className="status-slot status-slot-summary">{summaryText(state, now)}</span>
      <span className="status-slot status-slot-tool-version">Tool v{toolConfig.version}</span>
      <span className="status-slot status-slot-template-version">
        Template v{templateBaseVersion}
      </span>
    </>
  );

  const hasLegacySections = Boolean(
    ToolShellCompat.Toolbar &&
    ToolShellCompat.Body &&
    ToolShellCompat.Sidebar &&
    ToolShellCompat.Canvas &&
    ToolShellCompat.StatusBar
  );

  return (
    <ToolShellCompat
      config={toolConfig}
      sidebarOpen={sidebarOpen}
      onSidebarChange={setSidebarOpen}
      toolbar={toolbarContent}
      sidebar={sidebarContent}
      canvas={canvasContent}
      statusBar={statusBarContent}
    >
      {hasLegacySections
        ? (() => {
            const ToolbarSection = ToolShellCompat.Toolbar as ComponentType<{
              children?: ReactNode;
            }>;
            const BodySection = ToolShellCompat.Body as ComponentType<{ children?: ReactNode }>;
            const SidebarSection = ToolShellCompat.Sidebar as ComponentType<{
              children?: ReactNode;
            }>;
            const CanvasSection = ToolShellCompat.Canvas as ComponentType<{ children?: ReactNode }>;
            const StatusBarSection = ToolShellCompat.StatusBar as ComponentType<{
              children?: ReactNode;
            }>;
            return (
              <>
                <ToolbarSection>{toolbarContent}</ToolbarSection>
                <BodySection>
                  <SidebarSection>{sidebarContent}</SidebarSection>
                  <CanvasSection>{canvasContent}</CanvasSection>
                </BodySection>
                <StatusBarSection>{statusBarContent}</StatusBarSection>
              </>
            );
          })()
        : null}
    </ToolShellCompat>
  );
}
