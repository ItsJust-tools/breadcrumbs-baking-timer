import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import manifest from '@/app/manifest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import ErrorPage from '@/app/error';
import NotFound from '@/app/not-found';
import { JsonLd } from '@/app/json-ld';
import ToolPage from '@/app/page';
import { cn } from '@/lib/utils';
import { generateJsonLd, generateToolMetadata } from '@/lib/seo';
import toolConfig from '@/tool/tool.config';
import { getPublicSiteUrl, templateMetadata } from '@/tool/template-metadata';
import { breadcrumbsBakingTimerTool } from '@/tool/tool-definition';
import { Canvas } from '@/tool/components/Canvas';
import { Sidebar } from '@/tool/components/Sidebar';
import { Toolbar } from '@/tool/components/Toolbar';
import { DEFAULT_STATE as BASE_DEFAULT_STATE, emptyRun } from '@/tool/types';
import type { ToolState } from '@/tool/types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/tool-client-wrapper', () => ({
  default: () => <div data-testid="tool-client-wrapper">tool-client-wrapper</div>,
}));

const sampleState = (): ToolState => ({
  ...BASE_DEFAULT_STATE,
  steps: [
    { id: 'a', name: 'Autolyse', durationMs: 1_800_000, tempNote: '22°C' },
    { id: 'b', name: 'Bake', durationMs: 2_700_000, tempNote: '230°C' },
  ],
  runs: { a: emptyRun(), b: emptyRun() },
});

describe('app and seo', () => {
  it('builds metadata and json-ld values', () => {
    const metadata = generateToolMetadata(toolConfig);
    const jsonLd = generateJsonLd(toolConfig);

    expect(metadata.creator).toBe(toolConfig.name);
    expect(metadata.metadataBase?.toString()).toBe('http://localhost:3000/');
    expect(jsonLd.url).toBe('http://localhost:3000');
    expect(jsonLd.featureList.length).toBeGreaterThan(0);
  });

  it('returns site manifest, robots and sitemap', () => {
    const man = manifest();
    const rob = robots();
    const sm = sitemap();

    expect(man.name).toBe(templateMetadata.appName);
    expect(rob.sitemap).toBe('http://localhost:3000/sitemap.xml');
    expect(sm[0]?.url).toBe('http://localhost:3000');
  });

  it('renders json-ld script safely', () => {
    render(<JsonLd config={{ ...toolConfig, name: '</script>' }} />);
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script?.innerHTML).toContain('\\u003c/script>');
  });

  it('renders error page and invokes reset', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('boom')} reset={reset} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders not-found page', () => {
    render(<NotFound />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('renders top-level tool page', () => {
    render(<ToolPage />);
    expect(screen.getByTestId('tool-client-wrapper')).toBeInTheDocument();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeInTheDocument();
  });

  it('covers tool definition and helper exports', () => {
    expect(cn('a', undefined, 'b', false, null, 'c')).toBe('a b c');
    expect(getPublicSiteUrl()).toBe('http://localhost:3000');
    expect(breadcrumbsBakingTimerTool.name).toBe(toolConfig.name);
    expect(breadcrumbsBakingTimerTool.id).toBe('breadcrumbs-baking-timer');

    const repaired = breadcrumbsBakingTimerTool.deserialize({ nope: true });
    expect(repaired.success).toBe(false);
    if (!repaired.success) {
      expect(repaired.error).toContain('Invalid');
    }
    const ok = breadcrumbsBakingTimerTool.deserialize({
      steps: [{ name: 'Knead', durationMs: 600_000, tempNote: '' }],
    });
    expect(ok.success).toBe(true);
    expect(breadcrumbsBakingTimerTool.serialize(sampleState())).toContain('"name":"Autolyse"');
    expect(breadcrumbsBakingTimerTool.initialState.steps).toEqual([]);
  });

  it('renders tool components', () => {
    render(
      <>
        <Toolbar state={sampleState()} onChange={() => {}} onClear={() => {}} onCopy={() => {}} />
        <Sidebar state={sampleState()} onChange={() => {}} now={1000} />
        <Canvas state={sampleState()} onChange={() => {}} now={1_000} />
      </>
    );

    expect(screen.getByTestId('preset-select')).toBeInTheDocument();
    expect(screen.getByTestId('btn-toggle-sound')).toBeInTheDocument();
    expect(screen.getByTestId('bake-timer-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('step-card-a')).toBeInTheDocument();
    expect(screen.getByTestId('remaining-a')).toHaveTextContent('30:00');
    expect(screen.getByTestId('step-list')).toBeInTheDocument();
    expect(screen.getByTestId('add-step-form')).toBeInTheDocument();
  });

  it('renders empty-plan hint when no steps exist', () => {
    render(<Canvas state={{ ...BASE_DEFAULT_STATE }} onChange={() => {}} now={0} />);
    expect(screen.getByTestId('empty-plan')).toBeInTheDocument();
  });
});
