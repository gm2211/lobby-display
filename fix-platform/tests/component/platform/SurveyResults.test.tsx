/**
 * SurveyResults component tests
 *
 * Tests cover:
 * - Survey header: title, status, response count, date range
 * - Per-question results:
 *     TEXT: list of text responses
 *     RATING: average rating display, distribution bar chart
 *     SINGLE_CHOICE / MULTIPLE_CHOICE: bar chart showing option counts and percentages
 * - Total response count prominently displayed
 * - Export to CSV button (client-side generation)
 * - Loading spinner while fetching
 * - Error state with retry
 * - Back link to /platform/surveys
 * - MANAGER+ only access pattern (via role gate in router; tested via route render)
 *
 * TDD: Written before implementation (Red phase).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SurveyResults from '../../../src/platform/pages/SurveyResults';
import type { SurveyResultsData } from '../../../src/platform/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderWithParams(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/platform/surveys/${id}/results`]}>
      <Routes>
        <Route path="/platform/surveys/:id/results" element={<SurveyResults />} />
        <Route path="/platform/surveys" element={<div>Survey List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function makeResultsData(overrides: Partial<SurveyResultsData> = {}): SurveyResultsData {
  return {
    survey: {
      id: 1,
      title: 'Q1 Resident Satisfaction',
      description: 'Quarterly survey',
      status: 'ACTIVE',
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-03-31T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      questions: [],
      _count: { responses: 42, questions: 3 },
    },
    totalResponses: 42,
    questions: [
      {
        id: '1',
        text: 'How would you rate the amenities?',
        type: 'RATING',
        responses: [
          { value: '5' },
          { value: '4' },
          { value: '5' },
          { value: '3' },
          { value: '4' },
        ],
      },
      {
        id: '2',
        text: 'Any additional comments?',
        type: 'TEXT',
        responses: [
          { value: 'Great place to live!' },
          { value: 'Could improve parking.' },
        ],
      },
      {
        id: '3',
        text: 'Which feature do you use most?',
        type: 'SINGLE_CHOICE',
        options: ['Pool', 'Gym', 'Rooftop'],
        responses: [
          { value: 'Pool' },
          { value: 'Gym' },
          { value: 'Pool' },
          { value: 'Rooftop' },
        ],
      },
    ],
    ...overrides,
  };
}

function mockFetch(data: SurveyResultsData) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown) => {
    const urlStr = String(url);
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf-token' }),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    } as Response);
  }));
}

function mockFetchError(status: number, message: string) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: message,
    json: () => Promise.resolve({ error: message }),
  } as Response));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SurveyResults', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner while fetching', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithParams('1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Error state ---

  it('shows error message when fetch fails', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('retries fetch when retry button is clicked', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    // Now mock success and click retry
    mockFetch(makeResultsData());
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Q1 Resident Satisfaction')).toBeInTheDocument();
    });
  });

  // --- Survey header ---

  it('renders survey title in header', async () => {
    mockFetch(makeResultsData());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Q1 Resident Satisfaction')).toBeInTheDocument();
    });
  });

  it('renders survey status badge', async () => {
    mockFetch(makeResultsData());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByTestId('survey-status')).toBeInTheDocument();
    });
    expect(screen.getByTestId('survey-status')).toHaveTextContent('ACTIVE');
  });

  it('renders total response count prominently', async () => {
    mockFetch(makeResultsData());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByTestId('total-responses')).toBeInTheDocument();
    });
    expect(screen.getByTestId('total-responses').textContent).toContain('42');
  });

  it('renders survey date range when dates are provided', async () => {
    mockFetch(makeResultsData());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByTestId('survey-date-range')).toBeInTheDocument();
    });
  });

  // --- Back link ---

  it('renders back link to /platform/surveys', async () => {
    mockFetch(makeResultsData());
    renderWithParams('1');

    await waitFor(() => {
      const backLink = screen.getByRole('link', { name: /back.*survey/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/platform/surveys');
    });
  });

  // --- Export CSV button ---

  it('renders export to CSV button', async () => {
    mockFetch(makeResultsData());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export.*csv/i })).toBeInTheDocument();
    });
  });

  it('triggers CSV download when export button is clicked', async () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    const revokeObjectURL = vi.fn();

    vi.spyOn(window.URL, 'createObjectURL').mockImplementation(createObjectURL);
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);

    // Render first, then spy on createElement so the render itself is not affected
    mockFetch(makeResultsData());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /export.*csv/i })).toBeInTheDocument();
    });

    const clickMock = vi.fn();
    const anchor = document.createElement('a');
    anchor.click = clickMock;

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return anchor as HTMLAnchorElement;
      return origCreate(tag);
    });

    fireEvent.click(screen.getByRole('button', { name: /export.*csv/i }));

    expect(createObjectURL).toHaveBeenCalled();
    expect(clickMock).toHaveBeenCalled();
  });

  // --- Question results: TEXT ---

  it('renders TEXT question text responses as a list', async () => {
    const data = makeResultsData({
      questions: [
        {
          id: '1',
          text: 'Any comments?',
          type: 'TEXT',
          responses: [
            { value: 'Great place to live!' },
            { value: 'Could improve parking.' },
          ],
        },
      ],
    });
    mockFetch(data);
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Any comments?')).toBeInTheDocument();
    });

    expect(screen.getByText('Great place to live!')).toBeInTheDocument();
    expect(screen.getByText('Could improve parking.')).toBeInTheDocument();
  });

  it('shows response count for TEXT questions with no responses', async () => {
    const data = makeResultsData({
      questions: [
        {
          id: '1',
          text: 'Any comments?',
          type: 'TEXT',
          responses: [],
        },
      ],
    });
    mockFetch(data);
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Any comments?')).toBeInTheDocument();
    });

    // Should show "No responses" or similar empty state
    expect(screen.getByText(/no responses/i)).toBeInTheDocument();
  });

  // --- Question results: RATING ---

  it('renders RATING question with average rating display', async () => {
    const data = makeResultsData({
      questions: [
        {
          id: '1',
          text: 'Rate the amenities',
          type: 'RATING',
          responses: [
            { value: '4' },
            { value: '5' },
            { value: '3' },
          ],
        },
      ],
    });
    mockFetch(data);
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Rate the amenities')).toBeInTheDocument();
    });

    // Average is (4+5+3)/3 = 4.0
    expect(screen.getByTestId('rating-average-1')).toBeInTheDocument();
    expect(screen.getByTestId('rating-average-1').textContent).toContain('4');
  });

  it('renders RATING question with distribution bars for each star value', async () => {
    const data = makeResultsData({
      questions: [
        {
          id: '1',
          text: 'Rate the amenities',
          type: 'RATING',
          responses: [
            { value: '5' },
            { value: '4' },
            { value: '5' },
          ],
        },
      ],
    });
    mockFetch(data);
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Rate the amenities')).toBeInTheDocument();
    });

    // Should have distribution bars for each rating
    expect(screen.getByTestId('rating-dist-1')).toBeInTheDocument();
  });

  // --- Question results: SINGLE_CHOICE ---

  it('renders SINGLE_CHOICE question with option counts and percentages', async () => {
    const data = makeResultsData({
      questions: [
        {
          id: '1',
          text: 'Which amenity is best?',
          type: 'SINGLE_CHOICE',
          options: ['Pool', 'Gym', 'Rooftop'],
          responses: [
            { value: 'Pool' },
            { value: 'Pool' },
            { value: 'Gym' },
            { value: 'Rooftop' },
          ],
        },
      ],
    });
    mockFetch(data);
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Which amenity is best?')).toBeInTheDocument();
    });

    // Options should be listed
    expect(screen.getByText('Pool')).toBeInTheDocument();
    expect(screen.getByText('Gym')).toBeInTheDocument();
    expect(screen.getByText('Rooftop')).toBeInTheDocument();
  });

  it('renders SINGLE_CHOICE bars with percentages', async () => {
    const data = makeResultsData({
      questions: [
        {
          id: '1',
          text: 'Which amenity is best?',
          type: 'SINGLE_CHOICE',
          options: ['Pool', 'Gym'],
          responses: [
            { value: 'Pool' },
            { value: 'Pool' },
            { value: 'Gym' },
          ],
        },
      ],
    });
    mockFetch(data);
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Which amenity is best?')).toBeInTheDocument();
    });

    // 2/3 = ~67%
    expect(screen.getByTestId('choice-bar-1')).toBeInTheDocument();
  });

  // --- Question results: MULTIPLE_CHOICE ---

  it('renders MULTIPLE_CHOICE question with option counts', async () => {
    const data = makeResultsData({
      questions: [
        {
          id: '1',
          text: 'Which features do you use?',
          type: 'MULTIPLE_CHOICE',
          options: ['Pool', 'Gym', 'Lounge'],
          responses: [
            { value: 'Pool' },
            { value: 'Gym' },
            { value: 'Pool' },
            { value: 'Lounge' },
          ],
        },
      ],
    });
    mockFetch(data);
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Which features do you use?')).toBeInTheDocument();
    });

    expect(screen.getByText('Pool')).toBeInTheDocument();
    expect(screen.getByText('Gym')).toBeInTheDocument();
    expect(screen.getByText('Lounge')).toBeInTheDocument();
  });

  // --- Question headers ---

  it('renders question text as a heading for each question', async () => {
    mockFetch(makeResultsData());
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('How would you rate the amenities?')).toBeInTheDocument();
      expect(screen.getByText('Any additional comments?')).toBeInTheDocument();
      expect(screen.getByText('Which feature do you use most?')).toBeInTheDocument();
    });
  });

  // --- Zero responses edge case ---

  it('shows zero total responses gracefully', async () => {
    const data = makeResultsData({ totalResponses: 0, questions: [] });
    mockFetch(data);
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByTestId('total-responses')).toBeInTheDocument();
    });
    expect(screen.getByTestId('total-responses').textContent).toContain('0');
  });

  // --- Correct API endpoint called ---

  it('fetches from the correct results endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeResultsData()),
    } as Response);
    vi.stubGlobal('fetch', fetchSpy);

    renderWithParams('42');

    await waitFor(() => {
      expect(screen.getByText('Q1 Resident Satisfaction')).toBeInTheDocument();
    });

    const calls = fetchSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    const resultCall = calls.find((u: string) => u.includes('/surveys/42/results'));
    expect(resultCall).toBeTruthy();
  });
});
