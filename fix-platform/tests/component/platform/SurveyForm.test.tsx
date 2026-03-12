/**
 * SurveyForm component tests — RED/BLUE TDD
 *
 * Tests cover:
 * - Create mode: renders empty form at /platform/surveys/new
 * - Edit mode: loads data at /platform/surveys/:id/edit
 * - Validates required fields (title, at least one question with text)
 * - Submits create (POST /api/platform/surveys)
 * - Submits edit (PUT /api/platform/surveys/:id)
 * - Handles API errors with error banner
 * - Cancel navigation back to surveys list
 * - Loading spinner while fetching in edit mode
 * - Dynamic question builder (add, remove, reorder)
 * - Question type select with options for choice types
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SurveyForm from '../../../src/platform/pages/SurveyForm';
import type { Survey, SurveyQuestion } from '../../../src/platform/types';

// --- Helpers ---

const baseQuestion: SurveyQuestion = {
  id: 1,
  surveyId: 1,
  text: 'How satisfied are you?',
  questionType: 'RATING',
  options: [],
  required: true,
  sortOrder: 0,
};

const baseSurvey: Survey = {
  id: 1,
  title: 'Resident Satisfaction Survey',
  description: 'Please share your feedback.',
  status: 'DRAFT',
  startsAt: '2026-06-01T00:00:00.000Z',
  endsAt: '2026-12-31T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  questions: [baseQuestion],
  _count: { responses: 0, questions: 1 },
  hasResponded: false,
};

function makeSurvey(overrides: Partial<Survey> = {}): Survey {
  return { ...baseSurvey, ...overrides };
}

function renderCreateForm() {
  return render(
    <MemoryRouter initialEntries={['/platform/surveys/new']}>
      <Routes>
        <Route path="/platform/surveys/new" element={<SurveyForm />} />
        <Route path="/platform/surveys" element={<div>Surveys List</div>} />
        <Route path="/platform/surveys/:id" element={<div data-testid="survey-detail">Survey Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEditForm(id: string | number) {
  return render(
    <MemoryRouter initialEntries={[`/platform/surveys/${id}/edit`]}>
      <Routes>
        <Route path="/platform/surveys/:id/edit" element={<SurveyForm />} />
        <Route path="/platform/surveys" element={<div>Surveys List</div>} />
        <Route path="/platform/surveys/:id" element={<div data-testid="survey-detail">Survey Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function mockFetchCreate(createdSurvey: Survey = makeSurvey()) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf' }),
      } as Response);
    }
    if (opts?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(createdSurvey),
      } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(createdSurvey),
    } as Response);
  }));
}

function mockFetchEdit(survey: Survey = makeSurvey()) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes('/csrf')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ token: 'test-csrf' }),
      } as Response);
    }
    if (opts?.method === 'PUT') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(survey),
      } as Response);
    }
    // GET survey by id
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(survey),
    } as Response);
  }));
}

// --- Tests ---

describe('SurveyForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Create mode: renders empty form
  // ===========================================================================

  it('renders heading for create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('heading', { name: /create survey|new survey/i })).toBeInTheDocument();
  });

  it('renders title input empty in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
    expect(titleInput.value).toBe('');
  });

  it('renders description textarea in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
  });

  it('renders anonymous toggle in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/anonymous/i)).toBeInTheDocument();
  });

  it('renders start date input in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
  });

  it('renders end date input in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
  });

  it('renders add question button in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('button', { name: /add question/i })).toBeInTheDocument();
  });

  it('renders submit button in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('button', { name: /create survey|save|submit/i })).toBeInTheDocument();
  });

  it('renders cancel button in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  // ===========================================================================
  // Dynamic question builder
  // ===========================================================================

  it('shows no questions initially in create mode', () => {
    mockFetchCreate();
    renderCreateForm();
    // No question items should be present initially
    expect(screen.queryByLabelText(/question text/i)).not.toBeInTheDocument();
  });

  it('adds a question when add question button is clicked', () => {
    mockFetchCreate();
    renderCreateForm();
    const addBtn = screen.getByRole('button', { name: /add question/i });
    fireEvent.click(addBtn);
    // At least one question text input should appear (data-testid based)
    expect(screen.getByTestId('question-text-0')).toBeInTheDocument();
  });

  it('shows question type select when a question is added', () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    expect(screen.getByLabelText(/question.*type|type/i)).toBeInTheDocument();
  });

  it('shows remove button for each question', () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    expect(screen.getByRole('button', { name: /remove question|remove/i })).toBeInTheDocument();
  });

  it('removes question when remove button is clicked', async () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    const removeBtn = screen.getByRole('button', { name: /remove question|remove/i });
    fireEvent.click(removeBtn);
    await waitFor(() => {
      expect(screen.queryByLabelText(/question.*text|question 1/i)).not.toBeInTheDocument();
    });
  });

  it('adds multiple questions', () => {
    mockFetchCreate();
    renderCreateForm();
    const addBtn = screen.getByRole('button', { name: /add question/i });
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    const questionInputs = screen.getAllByRole('textbox').filter(
      (el) => el.getAttribute('aria-label')?.toLowerCase().includes('question') || false
    );
    // At least 2 question text inputs present (plus the title/description)
    expect(screen.getAllByLabelText(/question.*text|question \d/i).length).toBeGreaterThanOrEqual(2);
  });

  it('shows move up and move down buttons for reordering with multiple questions', () => {
    mockFetchCreate();
    renderCreateForm();
    const addBtn = screen.getByRole('button', { name: /add question/i });
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);
    // Move up/down buttons
    expect(screen.getAllByRole('button', { name: /move up/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: /move down/i }).length).toBeGreaterThanOrEqual(1);
  });

  // ===========================================================================
  // Choice type options
  // ===========================================================================

  it('shows add option button for SINGLE_CHOICE question type', async () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    const typeSelect = screen.getByLabelText(/question.*type|type/i) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'SINGLE_CHOICE' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add option/i })).toBeInTheDocument();
    });
  });

  it('shows add option button for MULTIPLE_CHOICE question type', async () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    const typeSelect = screen.getByLabelText(/question.*type|type/i) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'MULTIPLE_CHOICE' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add option/i })).toBeInTheDocument();
    });
  });

  it('does not show add option button for TEXT question type', async () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    const typeSelect = screen.getByLabelText(/question.*type|type/i) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'TEXT' } });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /add option/i })).not.toBeInTheDocument();
    });
  });

  it('does not show add option button for RATING question type', async () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    const typeSelect = screen.getByLabelText(/question.*type|type/i) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'RATING' } });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /add option/i })).not.toBeInTheDocument();
    });
  });

  it('adds an option input when add option is clicked', async () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    const typeSelect = screen.getByLabelText(/question.*type|type/i) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'SINGLE_CHOICE' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add option/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /add option/i }));
    await waitFor(() => {
      expect(screen.getByTestId('option-input-0-0')).toBeInTheDocument();
    });
  });

  it('removes an option when remove option is clicked', async () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /add question/i }));
    const typeSelect = screen.getByLabelText(/question.*type|type/i) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'SINGLE_CHOICE' } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add option/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /add option/i }));
    await waitFor(() => {
      expect(screen.getByTestId('option-input-0-0')).toBeInTheDocument();
    });
    const removeOptionBtn = screen.getByRole('button', { name: /remove option/i });
    fireEvent.click(removeOptionBtn);
    await waitFor(() => {
      expect(screen.queryByTestId('option-input-0-0')).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  it('shows error when title is empty on submit', async () => {
    mockFetchCreate();
    renderCreateForm();
    fireEvent.click(screen.getByRole('button', { name: /create survey|save|submit/i }));
    await waitFor(() => {
      expect(screen.getByText(/title.*required|required.*title/i)).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Create submission
  // ===========================================================================

  it('submits create form with POST to /api/platform/surveys', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey({ id: 99 })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey()) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'New Survey' } });

    fireEvent.click(screen.getByRole('button', { name: /create survey|save|submit/i }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([u, o]: [unknown, RequestInit | undefined]) =>
          String(u).includes('/api/platform/surveys') && o?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('navigates to survey detail after successful create', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey({ id: 99 })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey({ id: 99 })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'New Survey' } });
    fireEvent.click(screen.getByRole('button', { name: /create survey|save|submit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('survey-detail')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Edit mode: loads data
  // ===========================================================================

  it('shows loading spinner while fetching survey in edit mode', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    renderEditForm('1');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders heading for edit mode', async () => {
    mockFetchEdit(makeSurvey({ id: 1, title: 'My Survey' }));
    renderEditForm('1');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /edit survey/i })).toBeInTheDocument();
    });
  });

  it('populates title input with existing value in edit mode', async () => {
    mockFetchEdit(makeSurvey({ id: 1, title: 'Resident Satisfaction Survey' }));
    renderEditForm('1');

    await waitFor(() => {
      const titleInput = screen.getByLabelText(/title/i) as HTMLInputElement;
      expect(titleInput.value).toBe('Resident Satisfaction Survey');
    });
  });

  it('populates description with existing value in edit mode', async () => {
    mockFetchEdit(makeSurvey({ id: 1, description: 'Please share your feedback.' }));
    renderEditForm('1');

    await waitFor(() => {
      const descInput = screen.getByLabelText(/description/i) as HTMLTextAreaElement;
      expect(descInput.value).toBe('Please share your feedback.');
    });
  });

  it('populates questions with existing questions in edit mode', async () => {
    const surveyWithQuestion = makeSurvey({
      id: 1,
      questions: [
        { ...baseQuestion, text: 'How satisfied are you?', questionType: 'RATING', sortOrder: 0 },
      ],
    });
    mockFetchEdit(surveyWithQuestion);
    renderEditForm('1');

    await waitFor(() => {
      expect(screen.getByDisplayValue('How satisfied are you?')).toBeInTheDocument();
    });
  });

  it('renders existing question type in select', async () => {
    const surveyWithQuestion = makeSurvey({
      id: 1,
      questions: [
        { ...baseQuestion, questionType: 'TEXT', text: 'What is your name?', sortOrder: 0 },
      ],
    });
    mockFetchEdit(surveyWithQuestion);
    renderEditForm('1');

    await waitFor(() => {
      const select = screen.getByLabelText(/question.*type|type/i) as HTMLSelectElement;
      expect(select.value).toBe('TEXT');
    });
  });

  it('renders existing options for choice questions in edit mode', async () => {
    const surveyWithChoices = makeSurvey({
      id: 1,
      questions: [
        {
          ...baseQuestion,
          questionType: 'SINGLE_CHOICE',
          options: ['Very satisfied', 'Satisfied', 'Neutral'],
          text: 'Rate us',
          sortOrder: 0,
        },
      ],
    });
    mockFetchEdit(surveyWithChoices);
    renderEditForm('1');

    await waitFor(() => {
      expect(screen.getByDisplayValue('Very satisfied')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Satisfied')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Neutral')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Edit submission
  // ===========================================================================

  it('submits edit form with PUT to /api/platform/surveys/:id', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey({ id: 1 })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey({ id: 1 })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditForm('1');

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Updated Survey Title' } });
    fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([u, o]: [unknown, RequestInit | undefined]) =>
          String(u).includes('/api/platform/surveys/1') && o?.method === 'PUT'
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('navigates to survey detail after successful edit', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey({ id: 1 })) } as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey({ id: 1 })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditForm('1');

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

    await waitFor(() => {
      expect(screen.getByTestId('survey-detail')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Error handling
  // ===========================================================================

  it('shows error banner when create API fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          json: () => Promise.resolve({ message: 'Failed to create survey' }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey()) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderCreateForm();

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Survey' } });
    fireEvent.click(screen.getByRole('button', { name: /create survey|save|submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error banner when edit API fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'PUT') {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          json: () => Promise.resolve({ message: 'Failed to update survey' }),
        } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey({ id: 1 })) } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderEditForm('1');

    await waitFor(() => {
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save|update|submit/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('shows error when fetch survey fails in edit mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ message: 'Survey not found' }),
    } as unknown as Response));

    renderEditForm('9999');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Cancel navigation
  // ===========================================================================

  it('navigates back to surveys list when cancel is clicked in create mode', async () => {
    mockFetchCreate();
    renderCreateForm();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByText('Surveys List')).toBeInTheDocument();
    });
  });

  it('navigates back to surveys list when cancel is clicked in edit mode', async () => {
    mockFetchEdit();
    renderEditForm('1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.getByText('Surveys List')).toBeInTheDocument();
    });
  });

  // ===========================================================================
  // Loading state in submit
  // ===========================================================================

  it('disables submit button while submitting', async () => {
    let resolveFn: (value: Response) => void;
    const slowFetch = vi.fn().mockImplementation((url: unknown, opts?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('/csrf')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: 'csrf' }) } as Response);
      }
      if (opts?.method === 'POST') {
        return new Promise<Response>((resolve) => { resolveFn = resolve; });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSurvey()) } as Response);
    });
    vi.stubGlobal('fetch', slowFetch);

    renderCreateForm();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Survey' } });
    fireEvent.click(screen.getByRole('button', { name: /create survey|save|submit/i }));

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /saving|submitting|create survey|save/i });
      expect(btn).toBeDisabled();
    });
  });
});
