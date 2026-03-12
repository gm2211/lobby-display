/**
 * SurveyResults Page — MANAGER+ only
 *
 * Displays aggregated survey response data for a given survey:
 * - Survey header: title, status badge, response count, date range
 * - Per-question results by type:
 *     TEXT           → list of text responses
 *     RATING         → average rating + CSS distribution bar chart
 *     SINGLE_CHOICE  → CSS bar chart with option counts and percentages
 *     MULTIPLE_CHOICE → CSS bar chart with option counts and percentages
 *     YES_NO         → treated like SINGLE_CHOICE (Yes / No options)
 * - Total response count prominently displayed
 * - Export to CSV button (client-side generation, triggers download)
 * - Loading spinner, error state with retry, back link to /platform/surveys
 *
 * API:
 *   GET /api/platform/surveys/:id/results  → SurveyResultsData
 */
import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import type { SurveyResultsData, SurveyResultQuestion, QuestionType } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, Search, ClipboardList } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function calcAverage(responses: Array<{ value: string }>): number {
  if (responses.length === 0) return 0;
  const sum = responses.reduce((acc, r) => acc + (parseFloat(r.value) || 0), 0);
  return Math.round((sum / responses.length) * 10) / 10;
}

function countChoices(
  responses: Array<{ value: string }>,
  options: string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const opt of options) counts[opt] = 0;
  for (const r of responses) {
    if (r.value in counts) counts[r.value]++;
  }
  return counts;
}

function generateCSV(data: SurveyResultsData): string {
  const rows: string[] = [];

  // Header row
  rows.push(['Survey', 'Status', 'Total Responses'].join(','));
  rows.push([
    `"${data.survey.title.replace(/"/g, '""')}"`,
    data.survey.status,
    String(data.totalResponses),
  ].join(','));
  rows.push('');

  // Per-question data
  for (const q of data.questions) {
    rows.push(`"Question: ${q.text.replace(/"/g, '""')}"`);
    rows.push(`"Type: ${q.type}"`);

    if (q.type === 'TEXT') {
      rows.push('Response');
      for (const r of q.responses) {
        rows.push(`"${r.value.replace(/"/g, '""')}"`);
      }
    } else if (q.type === 'RATING') {
      const avg = calcAverage(q.responses);
      rows.push(`"Average Rating: ${avg}"`);
      rows.push('Rating,Count');
      for (let star = 1; star <= 5; star++) {
        const cnt = q.responses.filter(r => r.value === String(star)).length;
        rows.push(`${star},${cnt}`);
      }
    } else {
      // SINGLE_CHOICE, MULTIPLE_CHOICE, YES_NO
      const opts = q.options && q.options.length > 0
        ? q.options
        : Array.from(new Set(q.responses.map(r => r.value)));
      const counts = countChoices(q.responses, opts);
      rows.push('Option,Count,Percentage');
      for (const opt of opts) {
        const cnt = counts[opt] ?? 0;
        const pct = q.responses.length > 0
          ? Math.round((cnt / q.responses.length) * 100)
          : 0;
        rows.push(`"${opt.replace(/"/g, '""')}",${cnt},${pct}%`);
      }
    }
    rows.push('');
  }

  return rows.join('\n');
}

function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  ACTIVE: { color: '#2d7a47', bg: '#d4edda' },
  DRAFT:  { color: '#c9921b', bg: '#fff3cd' },
  CLOSED: { color: '#888', bg: '#f5f5f5' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_COLORS[status] ?? { color: '#888', bg: '#f5f5f5' };
  return (
    <span
      data-testid="survey-status"
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 600,
        color: cfg.color,
        backgroundColor: cfg.bg,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: cfg.color,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Question result components
// ---------------------------------------------------------------------------

function TextResults({ question }: { question: SurveyResultQuestion }) {
  if (question.responses.length === 0) {
    return (
      <p style={{ fontSize: '13px', color: 'var(--platform-text-secondary)', fontStyle: 'italic', margin: 0 }}>
        No responses yet.
      </p>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {question.responses.map((r, i) => (
        <li
          key={i}
          style={{
            fontSize: '14px',
            color: 'var(--platform-text-primary)',
            backgroundColor: 'var(--platform-bg)',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'var(--platform-border)',
            borderRadius: '6px',
            padding: '10px 14px',
            lineHeight: 1.5,
          }}
        >
          {r.value}
        </li>
      ))}
    </ul>
  );
}

function RatingResults({ question }: { question: SurveyResultQuestion }) {
  const avg = calcAverage(question.responses);
  const total = question.responses.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Average display */}
      <div
        data-testid={`rating-average-${question.id}`}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '36px', fontWeight: 700, color: 'var(--platform-accent)', lineHeight: 1 }}>
          {avg.toFixed(1)}
        </span>
        <span style={{ fontSize: '14px', color: 'var(--platform-text-secondary)' }}>
          / 5 average ({total} {total === 1 ? 'response' : 'responses'})
        </span>
      </div>

      {/* Distribution bars */}
      <div
        data-testid={`rating-dist-${question.id}`}
        style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
      >
        {[5, 4, 3, 2, 1].map((star) => {
          const count = question.responses.filter(r => r.value === String(star)).length;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          return (
            <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--platform-text-secondary)', width: '36px', flexShrink: 0, textAlign: 'right' }}>
                {star} ★
              </span>
              <div
                style={{
                  flex: 1,
                  height: '14px',
                  backgroundColor: 'var(--platform-bg)',
                  borderRadius: '7px',
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: 'var(--platform-border)',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    backgroundColor: '#e8b23a',
                    borderRadius: '7px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <span style={{ fontSize: '12px', color: 'var(--platform-text-secondary)', width: '44px', flexShrink: 0 }}>
                {count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChoiceResults({ question }: { question: SurveyResultQuestion }) {
  const total = question.responses.length;
  const opts = question.options && question.options.length > 0
    ? question.options
    : Array.from(new Set(question.responses.map(r => r.value)));
  const counts = countChoices(question.responses, opts);

  return (
    <div
      data-testid={`choice-bar-${question.id}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
    >
      {opts.map((opt) => {
        const count = counts[opt] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={opt} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '14px', color: 'var(--platform-text-primary)', fontWeight: 500 }}>
                {opt}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--platform-text-secondary)', flexShrink: 0, marginLeft: '8px' }}>
                {count} ({pct}%)
              </span>
            </div>
            <div
              style={{
                height: '16px',
                backgroundColor: 'var(--platform-bg)',
                borderRadius: '8px',
                overflow: 'hidden',
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: 'var(--platform-border)',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: 'var(--platform-accent)',
                  borderRadius: '8px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        );
      })}

      {total === 0 && (
        <p style={{ fontSize: '13px', color: 'var(--platform-text-secondary)', fontStyle: 'italic', margin: 0 }}>
          No responses yet.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Question card
// ---------------------------------------------------------------------------

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  TEXT: 'Text Response',
  RATING: 'Rating (1-5)',
  SINGLE_CHOICE: 'Single Choice',
  MULTIPLE_CHOICE: 'Multiple Choice',
  YES_NO: 'Yes / No',
};

function QuestionCard({ question }: { question: SurveyResultQuestion }) {
  const typeLabel = QUESTION_TYPE_LABELS[question.type] ?? question.type;
  const responseCount = question.responses.length;

  return (
    <div
      style={{
        backgroundColor: 'var(--platform-surface)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--platform-border)',
        borderRadius: '10px',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Question header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h3
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--platform-text-primary)',
          }}
        >
          {question.text}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--platform-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {typeLabel}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--platform-text-secondary)' }}>
            {responseCount} {responseCount === 1 ? 'response' : 'responses'}
          </span>
        </div>
      </div>

      {/* Results by type */}
      {question.type === 'TEXT' && <TextResults question={question} />}
      {question.type === 'RATING' && <RatingResults question={question} />}
      {(question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE' || question.type === 'YES_NO') && (
        <ChoiceResults question={question} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SurveyResults() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<SurveyResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const result = await api.get<SurveyResultsData>(`/api/platform/surveys/${id}/results`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load survey results');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleExportCSV = () => {
    if (!data) return;
    const csv = generateCSV(data);
    const filename = `survey-results-${data.survey.id}-${Date.now()}.csv`;
    downloadCSV(csv, filename);
  };

  // --- Loading state ---
  if (loading) {
    return <LoadingSpinner label="Loading survey results..." />;
  }

  // --- Error state ---
  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle size={22} />}
        message="Failed to load survey results"
        description={error}
        action={{ label: 'Retry', onClick: load }}
      />
    );
  }

  // --- Not found ---
  if (!data) {
    return (
      <EmptyState
        icon={<Search size={22} />}
        message="Survey not found"
        description="This survey does not exist or has been removed."
      />
    );
  }

  const { survey, totalResponses, questions } = data;

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const pageStyle: CSSProperties = {
    padding: '24px',
    maxWidth: '900px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  };

  const backLinkStyle: CSSProperties = {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  };

  const headerCardStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-border)',
    borderRadius: '10px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  const titleRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  };

  const titleStyle: CSSProperties = {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
  };

  const metaRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  };

  const responseCountStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
  };

  const responseNumberStyle: CSSProperties = {
    fontSize: '28px',
    fontWeight: 700,
    color: 'var(--platform-accent)',
    lineHeight: 1,
  };

  const responseLabelStyle: CSSProperties = {
    fontSize: '14px',
    color: 'var(--platform-text-secondary)',
  };

  const exportBtnStyle: CSSProperties = {
    backgroundColor: 'var(--platform-surface)',
    color: 'var(--platform-accent)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--platform-accent)',
    borderRadius: '6px',
    padding: '8px 18px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  };

  const dateRangeStyle: CSSProperties = {
    fontSize: '13px',
    color: 'var(--platform-text-secondary)',
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={pageStyle}>
      {/* Back link */}
      <Link to="/platform/surveys" style={backLinkStyle}>
        ← Back to Surveys
      </Link>

      {/* Survey header card */}
      <div style={headerCardStyle}>
        <div style={titleRowStyle}>
          <h1 style={titleStyle}>{survey.title}</h1>
          <button
            type="button"
            onClick={handleExportCSV}
            style={exportBtnStyle}
            aria-label="Export to CSV"
          >
            Export to CSV
          </button>
        </div>

        <div style={metaRowStyle}>
          <StatusBadge status={survey.status} />

          {/* Total responses — prominently displayed */}
          <div style={responseCountStyle}>
            <span style={responseNumberStyle} data-testid="total-responses">
              {totalResponses}
            </span>
            <span style={responseLabelStyle}>
              {totalResponses === 1 ? 'response' : 'responses'}
            </span>
          </div>

          {/* Date range */}
          {(survey.startsAt || survey.endsAt) && (
            <span style={dateRangeStyle} data-testid="survey-date-range">
              {formatDate(survey.startsAt)} – {formatDate(survey.endsAt)}
            </span>
          )}
        </div>

        {survey.description && (
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--platform-text-secondary)', lineHeight: 1.6 }}>
            {survey.description}
          </p>
        )}
      </div>

      {/* Question results */}
      {questions.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={22} />}
          message="No questions"
          description="This survey has no questions yet."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {questions.map((q) => (
            <QuestionCard key={q.id} question={q} />
          ))}
        </div>
      )}
    </div>
  );
}
