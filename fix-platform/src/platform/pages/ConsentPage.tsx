/**
 * ConsentPage — E-consent signing page for the platform portal.
 *
 * PURPOSE:
 * Displays a resident's consent forms split into two sections:
 * - Pending: forms the user hasn't signed yet, with a "Sign" button
 * - Signed:  forms the user has already signed, showing signed date
 *
 * USAGE:
 * Route: /platform/consent
 *
 * API:
 * GET  /api/platform/consent?active=true  → ConsentForm[]
 * GET  /api/platform/consent/my-signatures → ConsentSignature[]
 * POST /api/platform/consent/:id/sign      → ConsentSignature (201)
 *
 * GOTCHAS:
 * - Form body is rich text (HTML) — rendered via dangerouslySetInnerHTML
 * - Uses all-longhand CSS properties (no shorthand mixing)
 * - Uses optimistic UI: form moves from pending→signed immediately on success
 */
import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { LoadingSpinner, EmptyState } from '../components';

// ---- Types ----

interface ConsentForm {
  id: string;
  title: string;
  body: string;
  version: string;
  requiredForRoles: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { signatures: number };
}

interface ConsentSignature {
  id: string;
  formId: string;
  userId: number;
  signedAt: string;
  ipAddress: string;
  userAgent: string;
  form: {
    id: string;
    title: string;
    version: string;
    active: boolean;
  };
}

// ---- Helpers ----

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---- Sub-components ----

function SectionHeading({ title, count }: { title: string; count?: number }) {
  return (
    <div style={styles.sectionHeader}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {count !== undefined && count > 0 && (
        <span style={styles.sectionCount}>{count}</span>
      )}
    </div>
  );
}

function StatusMessage({ type, message }: { type: 'success' | 'error'; message: string }) {
  return (
    <div
      style={{
        ...styles.statusMsg,
        ...(type === 'success' ? styles.statusSuccess : styles.statusError),
      }}
      role="alert"
    >
      {message}
    </div>
  );
}

interface PendingFormCardProps {
  form: ConsentForm;
  onSign: (formId: string) => void;
  signing: boolean;
  feedback: { type: 'success' | 'error'; message: string } | null;
}

function PendingFormCard({ form, onSign, signing, feedback }: PendingFormCardProps) {
  return (
    <article style={styles.card} aria-label={form.title}>
      <div style={styles.cardHeader}>
        <div>
          <h3 style={styles.cardTitle}>{form.title}</h3>
          <span style={styles.versionBadge}>v{form.version}</span>
        </div>
        <button
          type="button"
          onClick={() => onSign(form.id)}
          disabled={signing}
          style={{ ...styles.signBtn, ...(signing ? styles.signBtnDisabled : {}) }}
          aria-label={signing ? 'Signing...' : 'Sign'}
        >
          {signing ? 'Signing...' : 'Sign'}
        </button>
      </div>

      <div
        style={styles.formBody}
        dangerouslySetInnerHTML={{ __html: form.body }}
      />

      {feedback && (
        <StatusMessage type={feedback.type} message={feedback.message} />
      )}
    </article>
  );
}

interface SignedFormCardProps {
  signature: ConsentSignature;
}

function SignedFormCard({ signature }: SignedFormCardProps) {
  return (
    <article style={styles.signedCard} aria-label={signature.form.title}>
      <div style={styles.signedCardInner}>
        <div>
          <h3 style={styles.cardTitle}>{signature.form.title}</h3>
          <span style={styles.versionBadge}>v{signature.form.version}</span>
        </div>
        <div style={styles.signedInfo}>
          <span style={styles.signedLabel}>Signed</span>
          <span style={styles.signedDate}>{formatDate(signature.signedAt)}</span>
        </div>
      </div>
    </article>
  );
}

// ---- Main Component ----

export default function ConsentPage() {
  const [forms, setForms] = useState<ConsentForm[]>([]);
  const [signatures, setSignatures] = useState<ConsentSignature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-form signing state
  const [signingFormId, setSiginingFormId] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<
    Record<string, { type: 'success' | 'error'; message: string }>
  >({});
  // Page-level toast shown after successful signing (form moves to signed section)
  const [pageFeedback, setPageFeedback] = useState<
    { type: 'success' | 'error'; message: string } | null
  >(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [formsRes, sigsRes] = await Promise.all([
        fetch('/api/platform/consent?active=true', { credentials: 'include' }),
        fetch('/api/platform/consent/my-signatures', { credentials: 'include' }),
      ]);

      if (!formsRes.ok || !sigsRes.ok) {
        throw new Error('Failed to load consent forms');
      }

      const [formsData, sigsData] = await Promise.all([
        formsRes.json() as Promise<ConsentForm[]>,
        sigsRes.json() as Promise<ConsentSignature[]>,
      ]);

      setForms(formsData);
      setSignatures(sigsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load consent forms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSign = async (formId: string) => {
    setSiginingFormId(formId);
    setFormFeedback((prev) => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });

    try {
      const res = await fetch(`/api/platform/consent/${formId}/sign`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || 'Failed to sign consent form');
      }

      const newSignature = (await res.json()) as ConsentSignature;

      // Optimistic update: find the form and add it to signatures
      const signedForm = forms.find((f) => f.id === formId);
      if (signedForm) {
        const optimisticSig: ConsentSignature = {
          ...newSignature,
          formId: signedForm.id,
          signedAt: newSignature.signedAt || new Date().toISOString(),
          form: {
            id: signedForm.id,
            title: signedForm.title,
            version: signedForm.version,
            active: signedForm.active,
          },
        };
        setSignatures((prev) => [...prev, optimisticSig]);
      }

      // Show page-level success toast (form has moved to signed section)
      setPageFeedback({ type: 'success', message: 'Signed successfully!' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sign consent form';
      // Show error both inline (on the pending card) and at page level
      setFormFeedback((prev) => ({
        ...prev,
        [formId]: { type: 'error', message: msg },
      }));
      setPageFeedback({ type: 'error', message: msg });
    } finally {
      setSiginingFormId(null);
    }
  };

  // ---- Derived state ----
  const signedFormIds = new Set(signatures.map((s) => s.formId));
  const pendingForms = forms.filter((f) => !signedFormIds.has(f.id));
  const signedFormsWithSigs = signatures;

  // ---- Render states ----

  if (loading) {
    return (
      <div style={styles.loadingWrapper}>
        <LoadingSpinner size="lg" label="Loading consent forms..." />
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorWrapper}>
        <p style={styles.errorText}>{error}</p>
        <button
          type="button"
          onClick={fetchData}
          style={styles.retryBtn}
          aria-label="Retry"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasAnyForms = forms.length > 0 || signatures.length > 0;

  if (!hasAnyForms) {
    return (
      <div style={styles.page}>
        <h1 style={styles.pageTitle}>Consent Forms</h1>
        <EmptyState
          message="No consent forms"
          description="There are no consent forms requiring your attention."
        />
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>Consent Forms</h1>

      {/* ---- Page-level feedback toast ---- */}
      {pageFeedback && (
        <StatusMessage type={pageFeedback.type} message={pageFeedback.message} />
      )}

      {/* ---- Pending Section ---- */}
      {pendingForms.length > 0 && (
        <section style={styles.section}>
          <SectionHeading title="Pending" count={pendingForms.length} />
          <div style={styles.cardList}>
            {pendingForms.map((form) => (
              <PendingFormCard
                key={form.id}
                form={form}
                onSign={handleSign}
                signing={signingFormId === form.id}
                feedback={formFeedback[form.id] ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---- Signed Section ---- */}
      {signedFormsWithSigs.length > 0 && (
        <section style={styles.section}>
          <SectionHeading title="Signed" count={signedFormsWithSigs.length} />
          <div style={styles.cardList}>
            {signedFormsWithSigs.map((sig) => (
              <SignedFormCard key={sig.id} signature={sig} />
            ))}
          </div>
        </section>
      )}

      {/* Edge case: forms loaded but all pending (no signatures) and no error */}
      {pendingForms.length === 0 && signedFormsWithSigs.length === 0 && (
        <EmptyState
          message="No consent forms"
          description="There are no consent forms requiring your attention."
        />
      )}
    </div>
  );
}

// ---- Styles ----

const styles: Record<string, CSSProperties> = {
  page: {
    paddingBottom: '48px',
  },
  pageTitle: {
    margin: '0 0 28px 0',
    fontSize: '24px',
    fontWeight: 600,
    color: '#333',
    letterSpacing: '-0.3px',
  },
  loadingWrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: '80px',
    paddingBottom: '80px',
  },
  errorWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '64px',
    paddingBottom: '64px',
    gap: '16px',
  },
  errorText: {
    color: '#c62828',
    fontSize: '15px',
    margin: '0',
  },
  retryBtn: {
    padding: '8px 20px',
    background: '#1a5c5a',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#145250',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },

  // Section
  section: {
    marginBottom: '32px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
  },
  sectionTitle: {
    margin: '0',
    fontSize: '14px',
    fontWeight: 600,
    color: '#444',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sectionCount: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '22px',
    height: '22px',
    borderRadius: '11px',
    background: '#e0e0e0',
    color: '#444',
    fontSize: '12px',
    fontWeight: 600,
    paddingLeft: '6px',
    paddingRight: '6px',
  },

  // Card list
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  // Pending form card
  card: {
    background: '#fff',
    borderRadius: '10px',
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: '#e0e0e0',
    borderRightColor: '#e0e0e0',
    borderBottomColor: '#e0e0e0',
    borderLeftColor: '#e0e0e0',
    padding: '24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '16px',
  },
  cardTitle: {
    margin: '0 0 6px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#333',
  },
  versionBadge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: 500,
    color: '#00838f',
    background: 'rgba(0,131,143,0.08)',
    borderRadius: '4px',
    paddingTop: '2px',
    paddingBottom: '2px',
    paddingLeft: '7px',
    paddingRight: '7px',
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: 'rgba(0,131,143,0.2)',
    borderRightColor: 'rgba(0,131,143,0.2)',
    borderBottomColor: 'rgba(0,131,143,0.2)',
    borderLeftColor: 'rgba(0,131,143,0.2)',
  },
  formBody: {
    fontSize: '14px',
    lineHeight: '1.65',
    color: '#444',
    marginBottom: '16px',
    maxHeight: '300px',
    overflowY: 'auto',
    paddingRight: '4px',
  },
  signBtn: {
    flexShrink: 0,
    padding: '9px 22px',
    background: '#1a5c5a',
    borderWidth: '0',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  signBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },

  // Signed form card
  signedCard: {
    background: '#fafafa',
    borderRadius: '8px',
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
    borderTopColor: '#eee',
    borderRightColor: '#eee',
    borderBottomColor: '#eee',
    borderLeftColor: '#eee',
    padding: '16px 20px',
  },
  signedCardInner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  signedInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
    flexShrink: 0,
  },
  signedLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#2e7d32',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  signedDate: {
    fontSize: '12px',
    color: '#888',
  },

  // Status messages
  statusMsg: {
    padding: '10px 14px',
    borderRadius: '6px',
    fontSize: '13px',
    marginTop: '12px',
    borderTopWidth: '1px',
    borderRightWidth: '1px',
    borderBottomWidth: '1px',
    borderLeftWidth: '1px',
    borderTopStyle: 'solid',
    borderRightStyle: 'solid',
    borderBottomStyle: 'solid',
    borderLeftStyle: 'solid',
  },
  statusSuccess: {
    background: '#f0fff4',
    borderTopColor: '#a3d9b1',
    borderRightColor: '#a3d9b1',
    borderBottomColor: '#a3d9b1',
    borderLeftColor: '#a3d9b1',
    color: '#2e7d32',
  },
  statusError: {
    background: '#fff0f0',
    borderTopColor: '#f5c0c0',
    borderRightColor: '#f5c0c0',
    borderBottomColor: '#f5c0c0',
    borderLeftColor: '#f5c0c0',
    color: '#c62828',
  },
};
