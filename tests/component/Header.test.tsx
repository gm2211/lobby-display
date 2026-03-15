import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from '../../src/components/Header';
import type { BuildingConfig } from '../../src/types';
import { ThemeProvider } from '../../src/theme/ThemeContext';

function makeConfig(overrides: Partial<BuildingConfig> = {}): BuildingConfig {
  return {
    id: 1,
    dashboardTitle: 'Building Updates',
    scrollSpeed: 30,
    tickerSpeed: 25,
    servicesScrollSpeed: 8,
    ...overrides,
  };
}

function renderHeader(config: BuildingConfig | null) {
  return render(
    <ThemeProvider>
      <Header config={config} />
    </ThemeProvider>
  );
}

describe('Header', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders dashboard title', () => {
    renderHeader(makeConfig());
    expect(screen.getByText('Building Updates')).toBeInTheDocument();
  });

  it('shows default title when config is null', () => {
    renderHeader(null);
    expect(screen.getByText('Building Updates')).toBeInTheDocument();
  });

  it('displays current time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T14:30:00'));
    renderHeader(makeConfig());
    // Should show time in 12-hour format
    expect(screen.getByText('02:30 PM')).toBeInTheDocument();
    vi.useRealTimers();
  });
});
