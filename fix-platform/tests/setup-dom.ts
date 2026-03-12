import '@testing-library/jest-dom';

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Mock requestAnimationFrame / cancelAnimationFrame
let rafId = 0;
global.requestAnimationFrame = (cb: FrameRequestCallback) => {
  rafId++;
  setTimeout(() => cb(performance.now()), 0);
  return rafId;
};
global.cancelAnimationFrame = (id: number) => {
  clearTimeout(id);
};
