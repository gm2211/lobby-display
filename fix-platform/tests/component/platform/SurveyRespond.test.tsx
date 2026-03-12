/**
 * SurveyRespond component tests
 *
 * Tests: renders survey questions by type (TEXT, SINGLE_CHOICE, MULTIPLE_CHOICE,
 *        RATING, YES_NO), submit answers, success state, already-responded state,
 *        loading/error states.
 *
 * TDD: Written before implementation (Red phase).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SurveyRespond from '../../../src/platform/pages/SurveyRespond';
import type { Survey, SurveyQuestion } from '../../../src/platform/types';

// Helper to render with route params
function renderWithParams(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/platform/surveys/${id}`]}>
      <Routes>
        <Route path="/platform/surveys/:id" element={<SurveyRespond />} />
        <Route path="/platform/surveys" element={<div>Survey List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const baseQuestion: SurveyQuestion = {
  id: 1,
  surveyId: 1,
  text: 'How satisfied are you overall?',
  questionType: 'TEXT',
  options: [],
  required: true,
  sortOrder: 1,
};

const baseSurvey: Survey = {
  id: 1,
  title: 'Resident Satisfaction Survey',
  description: 'Please share your feedback.',
  status: 'ACTIVE',
  startsAt: '2026-01-01T00:00:00.000Z',
  endsAt: '2026-12-31T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  questions: [baseQuestion],
  _count: { responses: 42, questions: 1 },
  hasResponded: false,
};

function makeSurvey(overrides: Partial<Survey> = {}): Survey {
  return { ...baseSurvey, ...overrides };
}

function makeQuestion(overrides: Partial<SurveyQuestion> = {}): SurveyQuestion {
  return { ...baseQuestion, ...overrides };
}

function mockFetch(handlers: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
    const urlStr = String(url);

    // CSRF token endpoint
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf-token' }),
      } as Response);
    }

    // Submit response endpoint (POST)
    if (urlStr.includes('/respond') && opts?.method === 'POST') {
      const response = handlers['respond'] ?? { success: true };
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(response),
      } as Response);
    }

    // Survey GET endpoint
    const surveyData = handlers['survey'] ?? baseSurvey;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(surveyData),
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

describe('SurveyRespond', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Loading state ---

  it('shows loading spinner initially', () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    renderWithParams('1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // --- Survey info ---

  it('renders survey title after fetching', async () => {
    mockFetch();
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Resident Satisfaction Survey')).toBeInTheDocument();
    });
  });

  it('renders survey description', async () => {
    mockFetch();
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Please share your feedback.')).toBeInTheDocument();
    });
  });

  // --- Question types ---

  it('renders TEXT question as textarea', async () => {
    const survey = makeSurvey({
      questions: [makeQuestion({ id: 1, text: 'Any comments?', questionType: 'TEXT' })],
    });
    mockFetch({ survey });
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Any comments?')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  it('renders SINGLE_CHOICE question as radio buttons', async () => {
    const survey = makeSurvey({
      questions: [makeQuestion({
        id: 1,
        text: 'Pick one',
        questionType: 'SINGLE_CHOICE',
        options: ['Option A', 'Option B', 'Option C'],
      })],
    });
    mockFetch({ survey });
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Pick one')).toBeInTheDocument();
      expect(screen.getByLabelText('Option A')).toBeInTheDocument();
      expect(screen.getByLabelText('Option B')).toBeInTheDocument();
      expect(screen.getByLabelText('Option C')).toBeInTheDocument();
      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(3);
    });
  });

  it('renders MULTIPLE_CHOICE question as checkboxes', async () => {
    const survey = makeSurvey({
      questions: [makeQuestion({
        id: 1,
        text: 'Select all that apply',
        questionType: 'MULTIPLE_CHOICE',
        options: ['Choice X', 'Choice Y', 'Choice Z'],
      })],
    });
    mockFetch({ survey });
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Select all that apply')).toBeInTheDocument();
      expect(screen.getByLabelText('Choice X')).toBeInTheDocument();
      expect(screen.getByLabelText('Choice Y')).toBeInTheDocument();
      expect(screen.getByLabelText('Choice Z')).toBeInTheDocument();
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBe(3);
    });
  });

  it('renders RATING question as star buttons', async () => {
    const survey = makeSurvey({
      questions: [makeQuestion({
        id: 1,
        text: 'Rate your experience',
        questionType: 'RATING',
      })],
    });
    mockFetch({ survey });
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Rate your experience')).toBeInTheDocument();
      // Should have 5 star rating buttons
      const starButtons = screen.getAllByRole('button', { name: /star/i });
      expect(starButtons.length).toBe(5);
    });
  });

  it('renders YES_NO question as two toggle buttons', async () => {
    const survey = makeSurvey({
      questions: [makeQuestion({
        id: 1,
        text: 'Would you recommend us?',
        questionType: 'YES_NO',
      })],
    });
    mockFetch({ survey });
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Would you recommend us?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
    });
  });

  // --- Submit ---

  it('renders a Submit button', async () => {
    mockFetch();
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });
  });

  it('shows success message after successful submission', async () => {
    mockFetch();
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/thank you/i)).toBeInTheDocument();
    });
  });

  // --- Already responded state ---

  it('shows already responded state when hasResponded is true', async () => {
    const survey = makeSurvey({ hasResponded: true });
    mockFetch({ survey });
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getAllByText(/already (submitted|responded)/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does not show submit button when hasResponded is true', async () => {
    const survey = makeSurvey({ hasResponded: true });
    mockFetch({ survey });
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument();
    });
  });

  // --- Error state ---

  it('shows error state on fetch failure', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/failed to load survey/i)).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockFetchError(500, 'Internal Server Error');
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  // --- Back link ---

  it('renders a back link to the surveys list', async () => {
    mockFetch();
    renderWithParams('1');

    await waitFor(() => {
      const backLink = screen.getByRole('link', { name: /back.*survey/i });
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/platform/surveys');
    });
  });

  // --- Required indicator ---

  it('shows required indicator for required questions', async () => {
    const survey = makeSurvey({
      questions: [makeQuestion({ required: true, text: 'Required question' })],
    });
    mockFetch({ survey });
    renderWithParams('1');

    await waitFor(() => {
      // Required indicator (*) should appear
      expect(screen.getByText('Required question')).toBeInTheDocument();
      const requiredMarker = screen.getByText('*');
      expect(requiredMarker).toBeInTheDocument();
    });
  });

  // --- CLOSED survey ---

  it('shows closed message for CLOSED surveys', async () => {
    const survey = makeSurvey({ status: 'CLOSED' });
    mockFetch({ survey });
    renderWithParams('1');

    await waitFor(() => {
      expect(screen.getByText(/survey.*closed/i)).toBeInTheDocument();
    });
  });
});
