/**
 * SurveyList page — /platform/surveys
 *
 * Displays the list of surveys available to platform users:
 * - Survey title and description snippet
 * - Status badge (DRAFT / ACTIVE / CLOSED)
 * - Question count and response count
 * - Link to respond page for ACTIVE surveys not yet answered
 * - "Already responded" badge if hasResponded is true
 * - Loading spinner, error state with retry, empty state
 *
 * API:
 *   GET /api/platform/surveys  →  Survey[]
 */
import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import type { Survey, SurveyStatus } from '../types';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { EmptyState } from '../components/EmptyState';
import { AlertTriangle, ClipboardList } from 'lucide-react';
import '../styles/tokens.css';

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<SurveyStatus, { bg: string; color: string }> = {
  DRAFT: { bg: '#e8ecf0', color: '#4a5568' },
  ACTIVE: { bg: '#d4edda', color: '#2d7a47' },
  CLOSED: { bg: '#f5e0e0', color: '#b93040' },
};

// ---------------------------------------------------------------------------
// SurveyList
// ---------------------------------------------------------------------------

export default function SurveyList() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<Survey[]>('/api/platform/surveys');
      setSurveys(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load surveys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSpinner label="Loading surveys..." />;

  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle size={22} />}
        message="Failed to load surveys"
        description={error}
        action={{ label: 'Retry', onClick: load }}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.heading}>Surveys</h1>
      </div>

      {/* List */}
      {surveys.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={22} />}
          message="No surveys available"
          description="There are no surveys at this time."
        />
      ) : (
        <div style={styles.list}>
          {surveys.map((survey) => (
            <SurveyCard key={survey.id} survey={survey} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SurveyCard
// ---------------------------------------------------------------------------

interface SurveyCardProps {
  survey: Survey;
}

function SurveyCard({ survey }: SurveyCardProps) {
  const [hovered, setHovered] = useState(false);
  const statusColors = STATUS_COLORS[survey.status];
  const questionCount = survey._count?.questions ?? survey.questions.length;
  const responseCount = survey._count?.responses ?? 0;
  const canRespond = survey.status === 'ACTIVE' && !survey.hasResponded;

  const getDescriptionSnippet = (text: string | null, maxLength = 140): string => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength).trimEnd() + '…';
  };

  return (
    <div
      role="article"
      aria-label={survey.title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--platform-surface-hover)' : 'var(--platform-surface)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--platform-border)',
        borderRadius: 'var(--platform-radius-lg)',
        padding: '20px 24px',
        transition: 'background 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {/* Top row: status badge + already-responded badge */}
      <div style={styles.topRow}>
        {/* Status badge */}
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 'var(--platform-radius-full)',
            background: statusColors.bg,
            color: statusColors.color,
            letterSpacing: '0.05em',
          }}
        >
          {survey.status}
        </span>

        {/* Already responded badge */}
        {survey.hasResponded && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 'var(--platform-radius-full)',
              background: '#d0e8f5',
              color: '#1a5f8a',
            }}
          >
            Already responded
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--platform-text-primary)',
          lineHeight: 1.4,
        }}
      >
        {survey.title}
      </h3>

      {/* Description snippet */}
      {survey.description && (
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: 'var(--platform-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          {getDescriptionSnippet(survey.description)}
        </p>
      )}

      {/* Stats row */}
      <div style={styles.statsRow}>
        <span style={styles.stat}>
          {questionCount} {questionCount === 1 ? 'question' : 'questions'}
        </span>
        <span style={styles.statDivider}>·</span>
        <span style={styles.stat}>
          {responseCount} {responseCount === 1 ? 'response' : 'responses'}
        </span>
      </div>

      {/* Respond link */}
      {canRespond && (
        <div>
          <Link
            to={`/platform/surveys/${survey.id}`}
            style={{
              display: 'inline-block',
              fontSize: '13px',
              fontWeight: 600,
              color: '#fff',
              background: 'var(--platform-accent)',
              padding: '7px 18px',
              borderRadius: 'var(--platform-radius-md)',
              textDecoration: 'none',
            }}
          >
            Take Survey
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Static styles
// ---------------------------------------------------------------------------

const styles: Record<string, CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '12px',
  },
  heading: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--platform-text-primary)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  stat: {
    fontSize: '12px',
    color: 'var(--platform-text-muted)',
  },
  statDivider: {
    fontSize: '12px',
    color: 'var(--platform-text-muted)',
  },
};
