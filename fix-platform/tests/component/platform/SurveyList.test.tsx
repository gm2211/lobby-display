/**
 * SurveyList component tests
 *
 * Tests: renders list of surveys, status badges, question/response count,
 *        "Already responded" badge, link to respond page for ACTIVE surveys,
 *        loading/error/empty states.
 *
 * TDD: Written before implementation (Red phase).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SurveyList from '../../../src/platform/pages/SurveyList';
import type { Survey } from '../../../src/platform/types';

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const baseSurvey: Survey = {
  id: 1,
  title: 'Resident Satisfaction Survey',
  description: 'How are we doing? Please share your feedback.',
  status: 'ACTIVE',
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-12-31T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  questions: [],
  _count: { responses: 42, questions: 5 },
  hasResponded: false,
};

function makeSurvey(overrides: Partial<Survey> = {}): Survey {
  return { ...baseSurvey, ...overrides };
}

describe('SurveyList', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithRouter(<SurveyList />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Renders surveys ---

  it('renders survey titles after fetching', async () => {
    const surveys = [
      makeSurvey({ id: 1, title: 'Resident Satisfaction Survey' }),
      makeSurvey({ id: 2, title: 'Building Amenities Survey' }),
    ];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText('Resident Satisfaction Survey')).toBeInTheDocument();
      expect(screen.getByText('Building Amenities Survey')).toBeInTheDocument();
    });
  });

  it('renders survey description snippet', async () => {
    const surveys = [makeSurvey({ description: 'How are we doing? Please share your feedback.' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText(/how are we doing/i)).toBeInTheDocument();
    });
  });

  // --- Status badges ---

  it('shows ACTIVE status badge', async () => {
    const surveys = [makeSurvey({ status: 'ACTIVE' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    });
  });

  it('shows DRAFT status badge', async () => {
    const surveys = [makeSurvey({ status: 'DRAFT' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText('DRAFT')).toBeInTheDocument();
    });
  });

  it('shows CLOSED status badge', async () => {
    const surveys = [makeSurvey({ status: 'CLOSED' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText('CLOSED')).toBeInTheDocument();
    });
  });

  // --- Question and response counts ---

  it('shows question count', async () => {
    const surveys = [makeSurvey({ _count: { questions: 7, responses: 10 } })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText(/7.*question/i)).toBeInTheDocument();
    });
  });

  it('shows response count', async () => {
    const surveys = [makeSurvey({ _count: { questions: 5, responses: 42 } })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText(/42.*response/i)).toBeInTheDocument();
    });
  });

  // --- Already responded badge ---

  it('shows "Already responded" badge when hasResponded is true', async () => {
    const surveys = [makeSurvey({ hasResponded: true })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText(/already responded/i)).toBeInTheDocument();
    });
  });

  it('does not show "Already responded" badge when hasResponded is false', async () => {
    const surveys = [makeSurvey({ hasResponded: false })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.queryByText(/already responded/i)).not.toBeInTheDocument();
    });
  });

  // --- Respond link for ACTIVE surveys ---

  it('shows respond link for ACTIVE surveys', async () => {
    const surveys = [makeSurvey({ id: 3, status: 'ACTIVE', hasResponded: false })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      const link = screen.getByRole('link', { name: /take survey/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/platform/surveys/3');
    });
  });

  it('does not show respond link for DRAFT surveys', async () => {
    const surveys = [makeSurvey({ status: 'DRAFT' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /take survey/i })).not.toBeInTheDocument();
    });
  });

  it('does not show respond link for CLOSED surveys', async () => {
    const surveys = [makeSurvey({ status: 'CLOSED' })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /take survey/i })).not.toBeInTheDocument();
    });
  });

  it('does not show respond link when hasResponded is true', async () => {
    const surveys = [makeSurvey({ status: 'ACTIVE', hasResponded: true })];
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => surveys,
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /take survey/i })).not.toBeInTheDocument();
    });
  });

  // --- Empty state ---

  it('shows empty state when no surveys exist', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getAllByText(/no surveys/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Error state ---

  it('shows error state on fetch failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server Error' }),
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load surveys/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ error: 'Server Error' }),
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  // --- Page header ---

  it('renders the Surveys page header', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    renderWithRouter(<SurveyList />);

    await waitFor(() => {
      expect(screen.getByText('Surveys')).toBeInTheDocument();
    });
  });
});
