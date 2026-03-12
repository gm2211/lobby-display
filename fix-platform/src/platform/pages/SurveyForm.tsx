/**
 * SurveyForm page — create and edit surveys (MANAGER+ only)
 *
 * Routes:
 *   /platform/surveys/new        — create mode (POST to /api/platform/surveys)
 *   /platform/surveys/:id/edit   — edit mode (GET then PUT /api/platform/surveys/:id)
 *
 * Form fields:
 *   - Title (required, text)
 *   - Description (optional, textarea)
 *   - Anonymous (checkbox)
 *   - Start date (optional, date)
 *   - End date (optional, date)
 *   - Dynamic question builder:
 *       - Add/remove questions
 *       - Question text (required), type select (TEXT, RATING, SINGLE_CHOICE, MULTIPLE_CHOICE)
 *       - For choice types: add/remove option inputs
 *       - Reorder questions (move up/down)
 *
 * On success → navigate to /platform/surveys/:id
 * On cancel  → navigate to /platform/surveys
 */
import { useState, useEffect, useCallback, type CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import type { Survey, QuestionType } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { AlertTriangle } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuestionDraft {
  /** Temporary client-side key for list keying */
  _key: string;
  text: string;
  questionType: QuestionType;
  options: string[];
  required: boolean;
}

interface FormState {
  title: string;
  description: string;
  anonymous: boolean;
  startsAt: string;
  endsAt: string;
  questions: QuestionDraft[];
}

interface FormErrors {
  title?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _keyCounter = 0;
function newKey(): string {
  return `q-${++_keyCounter}-${Date.now()}`;
}

/**
 * Convert an ISO datetime string to date input format (YYYY-MM-DD)
 */
function isoToDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return iso.slice(0, 10);
  } catch {
    return '';
  }
}

/**
 * Convert a date string (YYYY-MM-DD) to an ISO string
 */
function dateToIso(date: string): string | null {
  if (!date) return null;
  return new Date(date).toISOString();
}

const CHOICE_TYPES: QuestionType[] = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'];

function isChoiceType(qt: QuestionType): boolean {
  return CHOICE_TYPES.includes(qt);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SurveyForm() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

  const [form, setForm] = useState<FormState>({
    title: '',
    description: '',
    anonymous: false,
    startsAt: '',
    endsAt: '',
    questions: [],
  });

  // Load survey data in edit mode
  const loadSurvey = useCallback(async () => {
    if (!isEdit || !id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.get<Survey>(`/api/platform/surveys/${id}`);
      const questions: QuestionDraft[] = (data.questions ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((q) => ({
          _key: newKey(),
          text: q.text,
          questionType: q.questionType,
          options: q.options ?? [],
          required: q.required,
        }));
      setForm({
        title: data.title ?? '',
        description: data.description ?? '',
        anonymous: false,
        startsAt: isoToDate(data.startsAt),
        endsAt: isoToDate(data.endsAt),
        questions,
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load survey');
    } finally {
      setLoading(false);
    }
  }, [id, isEdit]);

  useEffect(() => {
    loadSurvey();
  }, [loadSurvey]);

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  function validate(): FormErrors {
    const errors: FormErrors = {};
    if (!form.title.trim()) {
      errors.title = 'Title is required';
    }
    return errors;
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        anonymous: form.anonymous,
        startsAt: dateToIso(form.startsAt),
        endsAt: dateToIso(form.endsAt),
        questions: form.questions.map((q, idx) => ({
          text: q.text.trim(),
          questionType: q.questionType,
          options: isChoiceType(q.questionType) ? q.options.filter(Boolean) : [],
          required: q.required,
          sortOrder: idx,
        })),
      };

      let result: Survey;
      if (isEdit && id) {
        result = await api.put<Survey>(`/api/platform/surveys/${id}`, payload);
      } else {
        result = await api.post<Survey>('/api/platform/surveys', payload);
      }

      navigate(`/platform/surveys/${result.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save survey');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/platform/surveys');
  };

  // ---------------------------------------------------------------------------
  // Form field helpers
  // ---------------------------------------------------------------------------

  function setField<K extends keyof Omit<FormState, 'questions'>>(
    key: K,
    value: FormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'title' && fieldErrors.title) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.title;
        return next;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Question management
  // ---------------------------------------------------------------------------

  function addQuestion() {
    setForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          _key: newKey(),
          text: '',
          questionType: 'TEXT' as QuestionType,
          options: [],
          required: false,
        },
      ],
    }));
  }

  function removeQuestion(index: number) {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  }

  function moveQuestion(index: number, direction: 'up' | 'down') {
    setForm((prev) => {
      const qs = [...prev.questions];
      const swapIdx = direction === 'up' ? index - 1 : index + 1;
      if (swapIdx < 0 || swapIdx >= qs.length) return prev;
      [qs[index], qs[swapIdx]] = [qs[swapIdx], qs[index]];
      return { ...prev, questions: qs };
    });
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setForm((prev) => {
      const qs = [...prev.questions];
      qs[index] = { ...qs[index], ...patch };
      // If type changes away from choice type, clear options
      if (patch.questionType && !isChoiceType(patch.questionType)) {
        qs[index] = { ...qs[index], options: [] };
      }
      return { ...prev, questions: qs };
    });
  }

  function addOption(questionIndex: number) {
    setForm((prev) => {
      const qs = [...prev.questions];
      qs[questionIndex] = {
        ...qs[questionIndex],
        options: [...qs[questionIndex].options, ''],
      };
      return { ...prev, questions: qs };
    });
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setForm((prev) => {
      const qs = [...prev.questions];
      const opts = [...qs[questionIndex].options];
      opts[optionIndex] = value;
      qs[questionIndex] = { ...qs[questionIndex], options: opts };
      return { ...prev, questions: qs };
    });
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    setForm((prev) => {
      const qs = [...prev.questions];
      const opts = qs[questionIndex].options.filter((_, i) => i !== optionIndex);
      qs[questionIndex] = { ...qs[questionIndex], options: opts };
      return { ...prev, questions: qs };
    });
  }

  // ---------------------------------------------------------------------------
  // Loading (edit mode fetch)
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '64px' }}>
        <LoadingSpinner size="lg" label="Loading survey..." />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Load error
  // ---------------------------------------------------------------------------

  if (loadError) {
    return (
      <div style={styles.page}>
        <div style={styles.errorAlert} role="alert">
          <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
          <span>{loadError}</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render form
  // ---------------------------------------------------------------------------

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>
        {isEdit ? 'Edit Survey' : 'Create Survey'}
      </h1>

      <div style={styles.card}>
        <form onSubmit={handleSubmit} noValidate data-testid="survey-form">

          {/* Title */}
          <div style={styles.fieldGroup}>
            <label htmlFor="survey-title" style={styles.label}>
              Title *
            </label>
            <input
              id="survey-title"
              type="text"
              style={fieldErrors.title ? styles.inputError : styles.input}
              value={form.title}
              onChange={(e) => setField('title', e.target.value)}
              placeholder="Survey title"
              aria-label="Title"
              data-testid="survey-title-input"
            />
            {fieldErrors.title && (
              <span style={styles.fieldError} data-testid="title-error">
                {fieldErrors.title}
              </span>
            )}
          </div>

          {/* Description */}
          <div style={styles.fieldGroup}>
            <label htmlFor="survey-description" style={styles.label}>
              Description
            </label>
            <textarea
              id="survey-description"
              style={styles.textarea}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Optional description"
              aria-label="Description"
              data-testid="survey-description-input"
              rows={3}
            />
          </div>

          {/* Anonymous toggle */}
          <div style={styles.checkboxRow}>
            <input
              id="survey-anonymous"
              type="checkbox"
              checked={form.anonymous}
              onChange={(e) => setField('anonymous', e.target.checked)}
              aria-label="Anonymous"
              data-testid="survey-anonymous-input"
            />
            <label htmlFor="survey-anonymous" style={styles.checkboxLabel}>
              Anonymous responses
            </label>
          </div>

          {/* Date row */}
          <div style={styles.row}>
            <div style={styles.halfField}>
              <label htmlFor="survey-starts-at" style={styles.label}>
                Start Date
              </label>
              <input
                id="survey-starts-at"
                type="date"
                style={styles.input}
                value={form.startsAt}
                onChange={(e) => setField('startsAt', e.target.value)}
                aria-label="Start Date"
                data-testid="survey-starts-at-input"
              />
            </div>

            <div style={styles.halfField}>
              <label htmlFor="survey-ends-at" style={styles.label}>
                End Date
              </label>
              <input
                id="survey-ends-at"
                type="date"
                style={styles.input}
                value={form.endsAt}
                onChange={(e) => setField('endsAt', e.target.value)}
                aria-label="End Date"
                data-testid="survey-ends-at-input"
              />
            </div>
          </div>

          {/* Divider */}
          <div style={styles.divider} />

          {/* Questions header */}
          <div style={styles.questionsHeader}>
            <span style={styles.questionsTitle}>Questions</span>
            <button
              type="button"
              style={styles.addQuestionBtn}
              onClick={addQuestion}
              aria-label="Add question"
              data-testid="add-question-btn"
            >
              + Add Question
            </button>
          </div>

          {/* Question list */}
          {form.questions.length === 0 && (
            <p style={styles.noQuestionsHint}>
              No questions yet. Click &ldquo;Add Question&rdquo; to get started.
            </p>
          )}

          {form.questions.map((question, qIdx) => (
            <QuestionEditor
              key={question._key}
              question={question}
              index={qIdx}
              total={form.questions.length}
              onUpdate={(patch) => updateQuestion(qIdx, patch)}
              onRemove={() => removeQuestion(qIdx)}
              onMoveUp={() => moveQuestion(qIdx, 'up')}
              onMoveDown={() => moveQuestion(qIdx, 'down')}
              onAddOption={() => addOption(qIdx)}
              onUpdateOption={(oIdx, val) => updateOption(qIdx, oIdx, val)}
              onRemoveOption={(oIdx) => removeOption(qIdx, oIdx)}
            />
          ))}

          {/* Submit error */}
          {submitError && (
            <div style={styles.errorAlert} role="alert" data-testid="submit-error">
              <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
              <span>{submitError}</span>
            </div>
          )}

          {/* Actions */}
          <div style={styles.actions}>
            <button
              type="button"
              style={styles.cancelBtn}
              onClick={handleCancel}
              aria-label="Cancel"
              data-testid="survey-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...styles.submitBtn,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
              disabled={submitting}
              data-testid="survey-submit-btn"
            >
              {submitting
                ? 'Saving...'
                : isEdit
                ? 'Save Changes'
                : 'Create Survey'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestionEditor sub-component
// ---------------------------------------------------------------------------

interface QuestionEditorProps {
  question: QuestionDraft;
  index: number;
  total: number;
  onUpdate: (patch: Partial<QuestionDraft>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddOption: () => void;
  onUpdateOption: (optionIndex: number, value: string) => void;
  onRemoveOption: (optionIndex: number) => void;
}

function QuestionEditor({
  question,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
}: QuestionEditorProps) {
  const labelId = `q-${index}-label`;
  const showOptions = isChoiceType(question.questionType);

  return (
    <div style={qStyles.card} data-testid={`question-${index}`}>
      {/* Question header: number + reorder + remove */}
      <div style={qStyles.header}>
        <span style={qStyles.number}>Question {index + 1}</span>
        <div style={qStyles.headerActions}>
          {total > 1 && (
            <>
              <button
                type="button"
                style={qStyles.iconBtn}
                onClick={onMoveUp}
                disabled={index === 0}
                aria-label="Move up"
                data-testid={`move-up-${index}`}
              >
                ↑
              </button>
              <button
                type="button"
                style={qStyles.iconBtn}
                onClick={onMoveDown}
                disabled={index === total - 1}
                aria-label="Move down"
                data-testid={`move-down-${index}`}
              >
                ↓
              </button>
            </>
          )}
          <button
            type="button"
            style={qStyles.removeBtn}
            onClick={onRemove}
            aria-label="Remove question"
            data-testid={`remove-question-${index}`}
          >
            Remove
          </button>
        </div>
      </div>

      {/* Question text */}
      <div style={qStyles.fieldGroup}>
        <label htmlFor={`q-${index}-text`} style={qStyles.label} id={labelId}>
          Question {index + 1} Text *
        </label>
        <input
          id={`q-${index}-text`}
          type="text"
          style={qStyles.input}
          value={question.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          placeholder="Enter question text"
          aria-label={`Question ${index + 1} Text`}
          data-testid={`question-text-${index}`}
        />
      </div>

      {/* Question type */}
      <div style={qStyles.fieldGroup}>
        <label htmlFor={`q-${index}-type`} style={qStyles.label}>
          Type
        </label>
        <select
          id={`q-${index}-type`}
          style={qStyles.select}
          value={question.questionType}
          onChange={(e) => onUpdate({ questionType: e.target.value as QuestionType })}
          aria-label="Question Type"
          data-testid={`question-type-${index}`}
        >
          <option value="TEXT">Text</option>
          <option value="RATING">Rating</option>
          <option value="SINGLE_CHOICE">Single Choice</option>
          <option value="MULTIPLE_CHOICE">Multiple Choice</option>
        </select>
      </div>

      {/* Options (for choice types) */}
      {showOptions && (
        <div style={qStyles.optionsSection}>
          <span style={qStyles.optionsLabel}>Options</span>
          {question.options.map((opt, oIdx) => (
            <div key={oIdx} style={qStyles.optionRow}>
              <input
                type="text"
                style={qStyles.optionInput}
                value={opt}
                onChange={(e) => onUpdateOption(oIdx, e.target.value)}
                placeholder={`Option ${oIdx + 1}`}
                aria-label={`Option ${oIdx + 1}`}
                data-testid={`option-input-${index}-${oIdx}`}
              />
              <button
                type="button"
                style={qStyles.removeOptionBtn}
                onClick={() => onRemoveOption(oIdx)}
                aria-label="Remove option"
                data-testid={`remove-option-${index}-${oIdx}`}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            style={qStyles.addOptionBtn}
            onClick={onAddOption}
            aria-label="Add option"
            data-testid={`add-option-${index}`}
          >
            + Add Option
          </button>
        </div>
      )}

      {/* Required checkbox */}
      <div style={qStyles.requiredRow}>
        <input
          id={`q-${index}-required`}
          type="checkbox"
          checked={question.required}
          onChange={(e) => onUpdate({ required: e.target.checked })}
          aria-label={`Question ${index + 1} Required`}
          data-testid={`question-required-${index}`}
        />
        <label htmlFor={`q-${index}-required`} style={qStyles.checkboxLabel}>
          Required
        </label>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  page: {
    padding: '24px',
    maxWidth: '760px',
    margin: '0 auto',
  },
  heading: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
    margin: '0 0 24px',
  },
  card: {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '12px',
    padding: '28px 32px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginBottom: '18px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  input: {
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  inputError: {
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#c62828',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  textarea: {
    backgroundColor: 'var(--platform-bg)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '9px 12px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: '80px',
  },
  fieldError: {
    fontSize: '12px',
    color: '#c62828',
    marginTop: '2px',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '18px',
  },
  checkboxLabel: {
    fontSize: '14px',
    color: 'var(--platform-text-primary)',
    cursor: 'pointer',
    userSelect: 'none',
  },
  row: {
    display: 'flex',
    gap: '16px',
    flexWrap: 'wrap',
    marginBottom: '18px',
  },
  halfField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: '1 1 200px',
    minWidth: '160px',
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--platform-border)',
    margin: '8px 0 20px',
  },
  questionsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  questionsTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
  },
  addQuestionBtn: {
    backgroundColor: 'transparent',
    color: 'var(--platform-accent)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-accent)',
    borderRadius: '6px',
    padding: '6px 14px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  noQuestionsHint: {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '16px 0',
    margin: 0,
  },
  errorAlert: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '14px 16px',
    backgroundColor: '#fff0f0',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#fbc2c4',
    borderRadius: '8px',
    color: '#c62828',
    fontSize: '14px',
    marginTop: '20px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '28px',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    padding: '10px 24px',
    fontSize: '15px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  submitBtn: {
    backgroundColor: 'var(--platform-accent)',
    color: '#fff',
    borderWidth: 0,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '8px',
    padding: '10px 28px',
    fontSize: '15px',
    fontWeight: 600,
    fontFamily: 'inherit',
  },
};

const qStyles: Record<string, CSSProperties> = {
  card: {
    backgroundColor: 'var(--platform-bg)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '8px',
    padding: '16px 20px',
    marginBottom: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  number: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  headerActions: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  iconBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '4px',
    width: '28px',
    height: '28px',
    fontSize: '14px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--platform-text-secondary)',
    fontFamily: 'inherit',
  },
  removeBtn: {
    backgroundColor: 'transparent',
    color: '#c62828',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#c62828',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  input: {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '8px 10px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  select: {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '8px 10px',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  optionsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  optionsLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--platform-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  optionRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  optionInput: {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-text-primary)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '7px 10px',
    fontSize: '14px',
    outline: 'none',
    flex: 1,
    fontFamily: 'inherit',
  },
  removeOptionBtn: {
    backgroundColor: 'transparent',
    color: '#c62828',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#c62828',
    borderRadius: '4px',
    width: '28px',
    height: '28px',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  addOptionBtn: {
    backgroundColor: 'transparent',
    color: 'var(--platform-text-secondary)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'var(--platform-border)',
    borderRadius: '6px',
    padding: '6px 12px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    alignSelf: 'flex-start',
  },
  requiredRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  checkboxLabel: {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    cursor: 'pointer',
    userSelect: 'none',
  },
};
