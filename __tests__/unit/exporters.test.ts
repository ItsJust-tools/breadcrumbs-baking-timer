import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatExportError, throwIfAborted, createCanvasExporter } from '@/tool/exporters/utils';
import pdfExporter from '@/tool/exporters/pdf';
import type { ExportOptions } from '@itsjust/core';

const toBlobMock = vi.fn();

vi.mock('html-to-image', () => ({
  toBlob: (...args: unknown[]) => toBlobMock(...args),
  toPng: vi.fn(),
}));

function mockImageClass(width: number, height: number) {
  return class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    private _src = '';
    get src() {
      return this._src;
    }
    set src(value: string) {
      this._src = value;
      queueMicrotask(() => this.onload?.());
    }
  };
}

function createFakeCanvasContext() {
  return {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe('exporters', () => {
  const makeOptions = (overrides: Partial<ExportOptions> = {}): ExportOptions => ({
    format: 'png',
    filename: 'test-export',
    ...overrides,
  });

  let getContextSpy: ReturnType<typeof vi.spyOn>;
  let canvasToBlobSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    toBlobMock.mockReset();
    toBlobMock.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    document.body.innerHTML = '';
    getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => createFakeCanvasContext());
    canvasToBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb) => cb(new Blob(['fake'], { type: 'image/png' })));
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    canvasToBlobSpy.mockRestore();
  });

  it('png exporter reports its format and mime type', async () => {
    const png = (await import('@/tool/exporters/png')).default;
    expect(png.format).toBe('png');
    const webp = (await import('@/tool/exporters/webp')).default;
    expect(webp.format).toBe('webp');
  });

  it('canvas exporter returns success with sanitized filename', async () => {
    Object.defineProperty(window, 'Image', { writable: true, value: mockImageClass(10, 10) });
    const exporter = createCanvasExporter('png', 'image/png', 'png');
    const result = await exporter.export(document.createElement('div'), makeOptions());
    expect(result.success).toBe(true);
    expect(result.filename).toContain('test-export');
  });

  it('canvas exporter returns a readable failure when rendering throws', async () => {
    toBlobMock.mockRejectedValue(new Error('render failed'));
    const exporter = createCanvasExporter('png', 'image/png', 'png');
    const result = await exporter.export(document.createElement('div'), makeOptions());
    expect(result.success).toBe(false);
    expect(result.error).toContain('render failed');
  });

  it('pdf export returns success metadata', async () => {
    const result = await pdfExporter.export(
      document.createElement('div'),
      makeOptions({ format: 'pdf' })
    );
    expect(result.format).toBe('pdf');
  });

  it('formatExportError surfaces readable messages and CORS hints', () => {
    expect(formatExportError(new Error('boom'), 'PNG')).toContain('boom');
    expect(formatExportError(new Error('tainted canvas'), 'PNG')).toContain('CORS');
    expect(formatExportError('not an error', 'PNG')).toContain('PNG export failed');
  });

  it('throwIfAborted raises on aborted signals', () => {
    const ctrl = new AbortController();
    ctrl.abort();
    expect(() => throwIfAborted(ctrl.signal)).toThrow();
    expect(() => throwIfAborted(undefined)).not.toThrow();
  });
});
