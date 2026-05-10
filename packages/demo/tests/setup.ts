import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Default matchMedia mock. Individual tests can override.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

// jsdom does not implement IntersectionObserver, provide a minimal stub
// that immediately reports the target as in view.
if (!('IntersectionObserver' in window)) {
  class IO {
    constructor(private cb: IntersectionObserverCallback) {}
    observe(target: Element) {
      // Fire synchronously so hook effects can settle without rAF gymnastics.
      this.cb(
        [
          {
            isIntersecting: true,
            target,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRatio: 1,
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
            time: 0,
          } as IntersectionObserverEntry,
        ],
        // biome-ignore lint/suspicious/noExplicitAny: stub
        this as any,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds = [];
  }
  // biome-ignore lint/suspicious/noExplicitAny: stub
  (window as any).IntersectionObserver = IO;
}

// jsdom doesn't implement HTMLCanvasElement.getContext. Provide a tiny stub
// so components that probe `canvas.getContext('2d')` get a workable object
// and don't bail early.
if (typeof HTMLCanvasElement !== 'undefined') {
  // biome-ignore lint/suspicious/noExplicitAny: stub
  const proto = HTMLCanvasElement.prototype as any;
  if (!proto.__ctx2dStubbed) {
    proto.getContext = function getContextStub(type: string) {
      if (type !== '2d') return null;
      return {
        canvas: this,
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        globalAlpha: 1,
        setTransform: vi.fn(),
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
      };
    };
    proto.__ctx2dStubbed = true;
  }
}
