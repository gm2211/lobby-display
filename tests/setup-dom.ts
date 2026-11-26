import '@testing-library/jest-dom';

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// Mock requestAnimationFrame / cancelAnimationFrame.
// The id returned IS the timer id, so cancelAnimationFrame really cancels the callback
// (otherwise a frame can fire after the test environment is torn down).
global.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 0) as unknown as number;
global.cancelAnimationFrame = (id: number) => {
  clearTimeout(id);
};
