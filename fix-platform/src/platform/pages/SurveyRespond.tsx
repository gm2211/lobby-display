/**
 * SurveyRespond page — /platform/surveys/:id
 *
 * Renders a survey for the user to respond to:
 * - Fetches survey details from GET /api/platform/surveys/:id
 * - Renders each question based on questionType:
 *     TEXT           → textarea
 *     SINGLE_CHOICE  → radio buttons
 *     MULTIPLE_CHOICE → checkboxes
 *     RATING         → star rating (1-5)
 *     YES_NO         → Yes/No toggle buttons
 * - Submit via POST /api/platform/surveys/:id/respond
 *     Body: { answers: [{ questionId, value }] }
 * - Shows success message after submission
 * - Shows "Already responded" state if already submitted
 * - Shows CLOSED state if survey is closed
 * - Loading spinner, error state with retry, back link to list
 *
 * API:
 *   GET  /api/platform/surveys/:id                → Survey
 *   POST /api/platform/surveys/:id/respond        → { success: true }
 */
import { useEffect, useState, useCallback, type CSSProperties, type ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import type { Survey, SurveyQuestion, QuestionType } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, Search } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Answer state type
// ---------------------------------------------------------------------------

type AnswerValue = string | string[];

interface AnswerMap {
  [questionId: number]: AnswerValue;
}

// ---------------------------------------------------------------------------
// SurveyRespond
// ---------------------------------------------------------------------------

export default function SurveyRespond() {
  const { id } = useParams<{ id: string }>();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<Survey>(`/api/platform/surveys/${id}`);
      setSurvey(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load survey');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAnswerChange = (questionId: number, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!survey || !id) return;
    try {
      setSubmitting(true);
      setSubmitError(null);
      const answerPayload = Object.entries(answers).map(([qId, value]) => ({
        questionId: Number(qId),
        value,
      }));
      await api.post(`/api/platform/surveys/${id}/respond`, { answers: answerPayload });
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner label="Loading survey..." />;

  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle size={22} />}
        message="Failed to load survey"
        description={error}
        action={{ label: 'Retry', onClick: load }}
      />
    );
  }

  if (!survey) {
    return (
      <EmptyState
        icon={<Search size={22} />}
        message="Survey not found"
        description="This survey does not exist or has been removed."
      />
    );
  }

  return (
    <div style={styles.container}>
      {/* Back link */}
      <Link to="/platform/surveys" style={styles.backLink}>
        ← Back to Surveys
      </Link>

      {/* Survey header */}
      <div style={styles.header}>
        <h1 style={styles.heading}>{survey.title}</h1>
        {survey.description && (
          <p style={styles.description}>{survey.description}</p>
        )}
      </div>

      {/* Already responded state */}
      {survey.hasResponded && !submitted && (
        <div style={styles.alreadyRespondedBox}>
          <span style={styles.alreadyRespondedIcon}>✓</span>
          <div>
            <p style={styles.alreadyRespondedTitle}>Already submitted</p>
            <p style={styles.alreadyRespondedText}>
              You have already responded to this survey. Thank you for your feedback!
            </p>
          </div>
        </div>
      )}

      {/* CLOSED survey state */}
      {survey.status === 'CLOSED' && !survey.hasResponded && (
        <div style={styles.closedBox}>
          <p style={styles.closedText}>This survey is closed and is no longer accepting responses.</p>
        </div>
      )}

      {/* Success state */}
      {submitted && (
        <div style={styles.successBox}>
          <span style={styles.successIcon}>✓</span>
          <div>
            <p style={styles.successTitle}>Thank you for your response!</p>
            <p style={styles.successText}>Your answers have been submitted successfully.</p>
          </div>
        </div>
      )}

      {/* Questions — only show if not already responded and not submitted and not closed */}
      {!survey.hasResponded && !submitted && survey.status !== 'CLOSED' && (
        <div style={styles.questionsContainer}>
          {survey.questions
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={answers[question.id] ?? (question.questionType === 'MULTIPLE_CHOICE' ? [] : '')}
                onChange={(val) => handleAnswerChange(question.id, val)}
              />
            ))}

          {submitError && (
            <p style={styles.submitError}>{submitError}</p>
          )}

          <div style={styles.submitRow}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                ...styles.submitButton,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestionField
// ---------------------------------------------------------------------------

interface QuestionFieldProps {
  question: SurveyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}

function QuestionField({ question, value, onChange }: QuestionFieldProps) {
  return (
    <div style={styles.questionCard}>
      {/* Question text */}
      <label style={styles.questionLabel}>
        {question.text}
        {question.required && (
          <span style={styles.requiredMark} aria-label="required">*</span>
        )}
      </label>

      {/* Input by type */}
      <QuestionInput
        question={question}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// QuestionInput — renders the appropriate input for each question type
// ---------------------------------------------------------------------------

interface QuestionInputProps {
  question: SurveyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}

function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  const { questionType } = question;

  if (questionType === 'TEXT') {
    return (
      <textarea
        value={value as string}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        rows={4}
        style={styles.textarea}
        aria-label={question.text}
      />
    );
  }

  if (questionType === 'SINGLE_CHOICE') {
    return (
      <div style={styles.optionsList} role="radiogroup" aria-label={question.text}>
        {question.options.map((option) => (
          <label key={option} style={styles.optionLabel}>
            <input
              type="radio"
              name={`question-${question.id}`}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              style={styles.radio}
              aria-label={option}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (questionType === 'MULTIPLE_CHOICE') {
    const selected = (value as string[]) || [];
    const toggle = (option: string) => {
      if (selected.includes(option)) {
        onChange(selected.filter((v) => v !== option));
      } else {
        onChange([...selected, option]);
      }
    };
    return (
      <div style={styles.optionsList}>
        {question.options.map((option) => (
          <label key={option} style={styles.optionLabel}>
            <input
              type="checkbox"
              value={option}
              checked={selected.includes(option)}
              onChange={() => toggle(option)}
              style={styles.checkbox}
              aria-label={option}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  if (questionType === 'RATING') {
    const rating = Number(value) || 0;
    return (
      <div style={styles.starRow} aria-label={question.text}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(String(star))}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
            style={{
              ...styles.starButton,
              color: star <= rating ? '#e8b23a' : '#ccc',
            }}
          >
            ★
          </button>
        ))}
      </div>
    );
  }

  if (questionType === 'YES_NO') {
    return (
      <div style={styles.yesNoRow}>
        <button
          type="button"
          onClick={() => onChange('yes')}
          aria-label="Yes"
          style={{
            ...styles.yesNoButton,
            background: value === 'yes' ? '#1a5c5a' : '#f5f0eb',
            color: value === 'yes' ? '#fff' : '#333',
            borderColor: value === 'yes' ? '#1a5c5a' : '#ddd',
          }}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange('no')}
          aria-label="No"
          style={{
            ...styles.yesNoButton,
            background: value === 'no' ? '#c62828' : '#f5f0eb',
            color: value === 'no' ? '#fff' : '#333',
            borderColor: value === 'no' ? '#c62828' : '#ddd',
          }}
        >
          No
        </button>
      </div>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Static styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  container: {
    maxWidth: '680px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  backLink: {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  heading: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
  },
  description: {
    margin: 0,
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
    lineHeight: 1.6,
  },
  alreadyRespondedBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    background: '#e8f5f5',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#1a5c5a',
    borderRadius: 'var(--platform-radius-lg)',
    padding: '16px 20px',
  },
  alreadyRespondedIcon: {
    fontSize: '20px',
    color: '#1a5c5a',
    flexShrink: 0,
  },
  alreadyRespondedTitle: {
    margin: '0 0 4px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#1a5c5a',
  },
  alreadyRespondedText: {
    margin: 0,
    fontSize: '13px',
    color: '#1a5c5a',
  },
  closedBox: {
    background: '#fff0f0',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#fbc2c4',
    borderRadius: 'var(--platform-radius-lg)',
    padding: '16px 20px',
  },
  closedText: {
    margin: 0,
    fontSize: '14px',
    color: '#c62828',
    fontWeight: 500,
  },
  successBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    background: '#f0fff4',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#2e7d32',
    borderRadius: 'var(--platform-radius-lg)',
    padding: '16px 20px',
  },
  successIcon: {
    fontSize: '20px',
    color: '#2e7d32',
    flexShrink: 0,
  },
  successTitle: {
    margin: '0 0 4px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#2e7d32',
  },
  successText: {
    margin: 0,
    fontSize: '13px',
    color: '#2e7d32',
  },
  questionsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  questionCard: {
    background: 'var(--platform-surface)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: 'var(--platform-radius-lg)',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  questionLabel: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--platform-text-primary)',
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  requiredMark: {
    color: '#c62828',
    fontSize: '14px',
    fontWeight: 700,
  },
  textarea: {
    width: '100%',
    resize: 'vertical',
    padding: '10px 12px',
    fontSize: '14px',
    color: 'var(--platform-text-primary)',
    background: 'var(--platform-bg)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: 'var(--platform-radius-md)',
    outline: 'none',
    boxSizing: 'border-box',
  },
  optionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  optionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    color: 'var(--platform-text-primary)',
    cursor: 'pointer',
  },
  radio: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    cursor: 'pointer',
  },
  starRow: {
    display: 'flex',
    gap: '4px',
  },
  starButton: {
    background: 'none',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'transparent',
    fontSize: '28px',
    cursor: 'pointer',
    padding: '0 2px',
    lineHeight: 1,
    transition: 'color 0.1s',
  },
  yesNoRow: {
    display: 'flex',
    gap: '12px',
  },
  yesNoButton: {
    fontSize: '14px',
    fontWeight: 600,
    padding: '8px 28px',
    borderRadius: 'var(--platform-radius-md)',
    borderWidth: '1px',
    borderStyle: 'solid',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  },
  submitRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingTop: '8px',
  },
  submitButton: {
    background: 'var(--platform-accent)',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 'var(--platform-radius-md)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    padding: '10px 28px',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  },
  submitError: {
    margin: 0,
    fontSize: '13px',
    color: '#c62828',
    textAlign: 'right',
  },
};
