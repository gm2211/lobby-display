/**
 * SearchPage - /platform/search
 *
 * Global search across all platform entities with:
 * - Search bar with 300ms debounced search-as-you-type
 * - Results grouped by entity type (Announcement, Event, Maintenance, etc.)
 * - Snippet highlighting of matching terms
 * - Click-through links to entity detail pages
 * - Loading states and empty states
 * - URL search param sync (?q=...)
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../utils/api';
import { LoadingSpinner, EmptyState } from '../components';
import { AlertTriangle, HelpCircle, SearchX } from 'lucide-react';

// --- Types ---

export interface SearchIndexResult {
  id: number;
  entityType: string;
  entityId: number;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

interface SearchResponse {
  results: SearchIndexResult[];
  total: number;
}

// --- Helpers ---

/**
 * Highlights occurrences of `term` in `text` by wrapping them in <mark> tags.
 * Returns an array of React nodes.
 */
function highlightTerm(text: string, term: string): React.ReactNode[] {
  if (!term.trim()) return [text];
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedTerm})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        style={{
          background: 'var(--platform-accent, #1a7a78)',
          color: '#fff',
          borderRadius: '2px',
          padding: '0 2px',
        }}
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * Trims body text to a short snippet around the first match.
 */
function getSnippet(body: string, term: string, maxLength = 180): string {
  const plain = body.replace(/[#*_~`>]/g, '').trim();
  if (!term.trim()) return plain.slice(0, maxLength) + (plain.length > maxLength ? '…' : '');

  const lowerPlain = plain.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lowerPlain.indexOf(lowerTerm);

  if (idx === -1) {
    return plain.slice(0, maxLength) + (plain.length > maxLength ? '…' : '');
  }

  // Center the window around the match
  const halfWindow = Math.floor(maxLength / 2);
  const start = Math.max(0, idx - halfWindow);
  const end = Math.min(plain.length, start + maxLength);
  const snippet = plain.slice(start, end);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < plain.length ? '…' : '';
  return prefix + snippet + suffix;
}

/**
 * Pluralizes an entity type label for use as a group header.
 * e.g. "Announcement" → "Announcements", "Maintenance" → "Maintenance"
 */
function pluralizeEntityType(entityType: string): string {
  const specials: Record<string, string> = {
    Maintenance: 'Maintenance',
    maintenance: 'Maintenance',
  };
  if (specials[entityType]) return specials[entityType];
  return entityType.endsWith('s') ? entityType : `${entityType}s`;
}

/**
 * Groups a flat list of results by their entityType.
 */
function groupByEntityType(results: SearchIndexResult[]): Map<string, SearchIndexResult[]> {
  const map = new Map<string, SearchIndexResult[]>();
  for (const r of results) {
    const group = map.get(r.entityType) ?? [];
    group.push(r);
    map.set(r.entityType, group);
  }
  return map;
}

const DEBOUNCE_MS = 300;

// --- Main Component ---

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';

  const [query, setQuery] = useState(initialQuery);
  // For initial URL param, skip debounce and search immediately
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchIndexResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether user has made input changes (vs initial load)
  const isFirstRender = useRef(true);

  // Debounce input changes (skip debounce on first render - initial query fires immediately)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Initial query from URL: fire immediately (no debounce)
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      // Sync URL param
      if (query.trim()) {
        setSearchParams({ q: query }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, setSearchParams]);

  // Perform search when debouncedQuery changes
  const doSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setTotal(0);
      setError(null);
      setHasSearched(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.get<SearchResponse>(
        `/api/platform/search?q=${encodeURIComponent(term)}&limit=50`
      );
      setResults(data.results);
      setTotal(data.total);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
      setTotal(0);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    doSearch(debouncedQuery);
  }, [debouncedQuery, doSearch]);

  const handleRetry = useCallback(() => {
    doSearch(debouncedQuery);
  }, [debouncedQuery, doSearch]);

  const grouped = groupByEntityType(results);

  return (
    <div>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--platform-text-primary)',
          }}
        >
          Search
        </h1>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '24px' }}>
        <input
          role="searchbox"
          type="search"
          aria-label="Search all content"
          placeholder="Search announcements, events, maintenance..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 14px',
            fontSize: '15px',
            background: 'var(--platform-bg-secondary)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--platform-border)',
            borderRadius: 'var(--platform-radius-md)',
            color: 'var(--platform-text-primary)',
            outline: 'none',
          }}
        />
      </div>

      {/* Results Area */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <LoadingSpinner size="md" label="Searching..." />
        </div>
      ) : error ? (
        <div>
          <EmptyState
            icon={<AlertTriangle size={22} />}
            message="Search failed"
            description={error}
            action={{ label: 'Retry', onClick: handleRetry }}
          />
        </div>
      ) : !query.trim() ? (
        <EmptyState
          icon={<HelpCircle size={22} />}
          message="Enter a search term to find content"
          description="Search across announcements, events, maintenance requests, and more."
        />
      ) : hasSearched && results.length === 0 ? (
        <EmptyState
          icon={<SearchX size={22} />}
          message={`No results for "${query}"`}
          description="Try different keywords or check your spelling."
        />
      ) : results.length > 0 ? (
        <div>
          {/* Result count */}
          <p
            style={{
              margin: '0 0 20px',
              fontSize: '13px',
              color: 'var(--platform-text-secondary)',
            }}
          >
            {total} result{total !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          </p>

          {/* Grouped results */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {Array.from(grouped.entries()).map(([entityType, groupResults]) => (
              <section key={entityType} aria-label={pluralizeEntityType(entityType)}>
                {/* Group header */}
                <h2
                  style={{
                    margin: '0 0 12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.07em',
                    color: 'var(--platform-text-secondary)',
                  }}
                >
                  {pluralizeEntityType(entityType)}
                </h2>

                {/* Result cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {groupResults.map((result) => (
                    <SearchResultCard key={result.id} result={result} query={query} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// --- Search Result Card ---

interface SearchResultCardProps {
  result: SearchIndexResult;
  query: string;
}

function SearchResultCard({ result, query }: SearchResultCardProps) {
  const [hovered, setHovered] = useState(false);
  const snippet = getSnippet(result.body, query);
  const highlightedTitle = highlightTerm(result.title, query);
  const highlightedSnippet = highlightTerm(snippet, query);

  return (
    <a
      href={result.url}
      aria-label={result.title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'block',
        background: hovered ? 'var(--platform-bg-card-hover)' : 'var(--platform-bg-card)',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--platform-border)',
        borderRadius: 'var(--platform-radius-lg)',
        padding: '14px 18px',
        textDecorationLine: 'none',
        color: 'inherit',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'var(--platform-text-primary)',
          marginBottom: '4px',
          lineHeight: 1.4,
        }}
      >
        {highlightedTitle}
      </div>

      {/* URL breadcrumb */}
      <div
        style={{
          fontSize: '11px',
          color: 'var(--platform-accent, #1a7a78)',
          marginBottom: '6px',
          fontFamily: 'monospace',
        }}
      >
        {result.url}
      </div>

      {/* Snippet */}
      {snippet && (
        <div
          style={{
            fontSize: '13px',
            color: 'var(--platform-text-muted)',
            lineHeight: 1.5,
          }}
        >
          {highlightedSnippet}
        </div>
      )}
    </a>
  );
}
