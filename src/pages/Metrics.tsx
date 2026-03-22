import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { headerBtn, headerBtnSecondary } from '../styles/buttons';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

type ServiceHistory = {
  id: number;
  name: string;
  currentStatus: string;
  history: { timestamp: string; status: string }[];
};

type MetricsResponse = {
  services: ServiceHistory[];
  range: string;
  since: string;
};

type Range = '24h' | '7d' | '30d';

type PercentileMetrics = {
  p50: number | null;
  p95: number | null;
  p99: number | null;
  count: number;
};

type TransitionMetrics = {
  outageToMaintenance: PercentileMetrics;
  maintenanceToOperational: PercentileMetrics;
  outageToOperational: PercentileMetrics;
};

type TransitionTimesResponse = {
  aggregate: TransitionMetrics;
  byService: Record<string, TransitionMetrics>;
};

const STATUS_COLORS: Record<string, string> = {
  Operational: '#4caf50',
  Maintenance: '#ff9800',
  Outage: '#f44336',
};

const statusToValue = (status: string): number => {
  if (status === 'Operational') return 2;
  if (status === 'Maintenance') return 1;
  return 0;
};

const yAxisTickFormatter = (value: number): string => {
  if (value === 2) return 'Operational';
  if (value === 1) return 'Maintenance';
  if (value === 0) return 'Outage';
  return '';
};

// Assign distinct colors to services by index — all high-contrast on white backgrounds
const SERVICE_LINE_COLORS = [
  '#2563eb', // Blue
  '#9333ea', // Purple
  '#e11d48', // Rose
  '#0891b2', // Cyan
  '#ea580c', // Orange
  '#059669', // Emerald
  '#6366f1', // Indigo
  '#d946ef', // Fuchsia
];

function formatTimestamp(ts: string, range: Range): string {
  const d = new Date(ts);
  if (range === '24h') {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#9e9e9e';
  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: color + '22',
        color: color,
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: color,
        borderRadius: '4px',
        padding: '2px 10px',
        fontSize: '13px',
        fontWeight: 600,
        letterSpacing: '0.02em',
      }}
    >
      {status}
    </span>
  );
}

// ---- Stacked bar timeline helpers ----

type TimeBucket = {
  label: string;
  startMs: number;
  endMs: number;
};

function buildTimeBuckets(since: string, range: Range): TimeBucket[] {
  const sinceMs = new Date(since).getTime();
  const nowMs = Date.now();
  const buckets: TimeBucket[] = [];

  if (range === '24h') {
    // Hourly buckets
    const start = new Date(sinceMs);
    start.setMinutes(0, 0, 0);
    let cur = start.getTime();
    while (cur < nowMs) {
      const next = cur + 3_600_000;
      const d = new Date(cur);
      const label = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      buckets.push({ label, startMs: cur, endMs: Math.min(next, nowMs) });
      cur = next;
    }
  } else if (range === '7d') {
    // Daily buckets
    const start = new Date(sinceMs);
    start.setHours(0, 0, 0, 0);
    let cur = start.getTime();
    while (cur < nowMs) {
      const next = cur + 86_400_000;
      const d = new Date(cur);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      buckets.push({ label, startMs: cur, endMs: Math.min(next, nowMs) });
      cur = next;
    }
  } else {
    // 30d — daily buckets
    const start = new Date(sinceMs);
    start.setHours(0, 0, 0, 0);
    let cur = start.getTime();
    while (cur < nowMs) {
      const next = cur + 86_400_000;
      const d = new Date(cur);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      buckets.push({ label, startMs: cur, endMs: Math.min(next, nowMs) });
      cur = next;
    }
  }

  return buckets;
}

type BucketStatus = 'Operational' | 'Maintenance' | 'Outage' | 'Unknown';

const STATUS_PRIORITY: Record<string, number> = {
  Outage: 3,
  Maintenance: 2,
  Operational: 1,
  Unknown: 0,
};

/** For a given service + bucket, pick the worst status that was active during the bucket */
function getDominantStatus(
  history: { timestamp: string; status: string }[],
  bucket: TimeBucket
): BucketStatus {
  if (history.length === 0) return 'Unknown';

  const sorted = history
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let worst: BucketStatus = 'Unknown';
  let worstPriority = -1;

  for (let i = 0; i < sorted.length; i++) {
    const segStart = new Date(sorted[i].timestamp).getTime();
    const segEnd =
      i + 1 < sorted.length
        ? new Date(sorted[i + 1].timestamp).getTime()
        : Date.now();

    // Check if this segment overlaps the bucket
    if (segEnd <= bucket.startMs || segStart >= bucket.endMs) continue;

    const status = sorted[i].status as BucketStatus;
    const priority = STATUS_PRIORITY[status] ?? 0;
    if (priority > worstPriority) {
      worst = status;
      worstPriority = priority;
    }
  }

  // If no segment explicitly covers the bucket, use the last known status before the bucket
  if (worst === 'Unknown') {
    const before = sorted.filter(h => new Date(h.timestamp).getTime() <= bucket.startMs);
    if (before.length > 0) {
      worst = before[before.length - 1].status as BucketStatus;
    }
  }

  return worst;
}

const BUCKET_STATUS_COLORS: Record<BucketStatus, string> = {
  Operational: '#4caf50',
  Maintenance: '#ff9800',
  Outage: '#f44336',
  Unknown: '#e0e0e0',
};

type ServiceBucketRow = {
  service: ServiceHistory;
  buckets: BucketStatus[];
};

function buildServiceBucketRows(
  services: ServiceHistory[],
  buckets: TimeBucket[]
): ServiceBucketRow[] {
  return services.map(svc => ({
    service: svc,
    buckets: buckets.map(b => getDominantStatus(svc.history, b)),
  }));
}

/** Decide how many X-axis labels to show so they don't overlap */
function pickLabelInterval(bucketCount: number, containerWidth: number): number {
  // Approximate label width ~55px; ensure enough spacing
  const maxLabels = Math.max(1, Math.floor(containerWidth / 60));
  return Math.max(1, Math.ceil(bucketCount / maxLabels));
}

// Stacked bar timeline component
function StatusTimelineChart({
  rows,
  buckets,
}: {
  rows: ServiceBucketRow[];
  buckets: TimeBucket[];
}) {
  const ROW_HEIGHT = 34;
  const LABEL_WIDTH = 130;
  const CHART_PADDING_TOP = 24;
  const CHART_PADDING_BOTTOM = 40;
  const bucketCount = buckets.length;

  // Decide label interval based on bucket count
  const labelInterval = pickLabelInterval(bucketCount, 700);

  const totalChartHeight =
    CHART_PADDING_TOP + rows.length * (ROW_HEIGHT + 8) + CHART_PADDING_BOTTOM;

  return (
    <div style={{ overflowX: 'auto', width: '100%' }}>
      <div
        style={{
          position: 'relative',
          minWidth: '500px',
          height: `${totalChartHeight}px`,
          display: 'flex',
        }}
      >
        {/* Service name labels column */}
        <div
          style={{
            width: `${LABEL_WIDTH}px`,
            flexShrink: 0,
            paddingTop: `${CHART_PADDING_TOP}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {rows.map(row => (
            <div
              key={row.service.id}
              style={{
                height: `${ROW_HEIGHT}px`,
                display: 'flex',
                alignItems: 'center',
                paddingRight: '10px',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#374151',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: `${LABEL_WIDTH - 10}px`,
                }}
              >
                {row.service.name}
              </span>
            </div>
          ))}
        </div>

        {/* Chart area */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          {/* Rows */}
          <div
            style={{
              paddingTop: `${CHART_PADDING_TOP}px`,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {rows.map(row => (
              <div
                key={row.service.id}
                style={{
                  height: `${ROW_HEIGHT}px`,
                  display: 'flex',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  backgroundColor: '#f3f4f6',
                }}
              >
                {row.buckets.map((status, bIdx) => {
                  const bucket = buckets[bIdx];
                  const color = BUCKET_STATUS_COLORS[status];
                  const isOperational = status === 'Operational';
                  return (
                    <div
                      key={bIdx}
                      title={`${bucket.label}: ${status}`}
                      style={{
                        flex: 1,
                        backgroundColor: isOperational
                          ? color + 'cc' // slightly transparent for operational
                          : color,
                        borderRightWidth: bIdx < row.buckets.length - 1 ? '1px' : '0',
                        borderRightStyle: 'solid',
                        borderRightColor: 'rgba(255,255,255,0.4)',
                        transition: 'opacity 0.1s',
                        cursor: 'default',
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* X-axis labels */}
          <div
            style={{
              marginTop: '6px',
              display: 'flex',
              position: 'relative',
              height: '30px',
            }}
          >
            {buckets.map((b, bIdx) =>
              bIdx % labelInterval === 0 ? (
                <div
                  key={bIdx}
                  style={{
                    flex: labelInterval,
                    fontSize: '11px',
                    color: '#6b7280',
                    textAlign: 'left',
                    paddingLeft: '2px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b.label}
                </div>
              ) : (
                <div key={bIdx} style={{ flex: 1 }} />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Trend computation helpers ----

type TrendInsights = {
  uptimeByService: { name: string; uptime: number }[];
  totalIncidents: number;
  avgRecoveryMs: number | null;
  statusDistribution: { name: string; value: number }[];
  incidentsByService: { name: string; incidents: number }[];
};

function computeTrends(services: ServiceHistory[], since: string): TrendInsights {
  const sinceMs = new Date(since).getTime();
  const nowMs = Date.now();
  const totalWindow = nowMs - sinceMs;

  const uptimeByService: { name: string; uptime: number }[] = [];
  const incidentsByService: { name: string; incidents: number }[] = [];
  let totalIncidents = 0;
  const recoveryDurations: number[] = [];

  // Aggregate status durations across all services for pie chart
  const aggDuration: Record<string, number> = {
    Operational: 0,
    Maintenance: 0,
    Outage: 0,
  };

  for (const svc of services) {
    // Sort history ascending
    const sorted = svc.history
      .slice()
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (sorted.length === 0) {
      uptimeByService.push({ name: svc.name, uptime: 100 });
      incidentsByService.push({ name: svc.name, incidents: 0 });
      continue;
    }

    // Compute duration per status segment
    let operationalMs = 0;
    let incidents = 0;
    let outageStartMs: number | null = null;

    // Prepare segment boundaries
    const segments: { status: string; startMs: number; endMs: number }[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const startMs = Math.max(new Date(sorted[i].timestamp).getTime(), sinceMs);
      const endMs =
        i + 1 < sorted.length
          ? new Date(sorted[i + 1].timestamp).getTime()
          : nowMs;
      if (endMs > startMs) {
        segments.push({ status: sorted[i].status, startMs, endMs });
      }
    }

    for (const seg of segments) {
      const dur = seg.endMs - seg.startMs;
      if (seg.status === 'Operational') {
        operationalMs += dur;
        // If we were tracking an outage, it ended
        if (outageStartMs !== null) {
          recoveryDurations.push(seg.startMs - outageStartMs);
          outageStartMs = null;
        }
      } else if (seg.status === 'Outage') {
        if (outageStartMs === null) {
          outageStartMs = seg.startMs;
          incidents++;
        }
      } else {
        // Maintenance — if outage was ongoing, treat it as recovered
        if (outageStartMs !== null) {
          recoveryDurations.push(seg.startMs - outageStartMs);
          outageStartMs = null;
        }
      }
      if (aggDuration[seg.status] !== undefined) {
        aggDuration[seg.status] += dur;
      }
    }

    totalIncidents += incidents;
    const uptimePct =
      totalWindow > 0 ? Math.round((operationalMs / totalWindow) * 1000) / 10 : 100;
    uptimeByService.push({ name: svc.name, uptime: Math.min(uptimePct, 100) });
    incidentsByService.push({ name: svc.name, incidents });
  }

  const avgRecoveryMs =
    recoveryDurations.length > 0
      ? recoveryDurations.reduce((a, b) => a + b, 0) / recoveryDurations.length
      : null;

  const totalAgg = Object.values(aggDuration).reduce((a, b) => a + b, 0);
  const statusDistribution =
    totalAgg > 0
      ? Object.entries(aggDuration)
          .filter(([, v]) => v > 0)
          .map(([name, value]) => ({ name, value: Math.round((value / totalAgg) * 1000) / 10 }))
      : [];

  return {
    uptimeByService,
    totalIncidents,
    avgRecoveryMs,
    statusDistribution,
    incidentsByService,
  };
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.round((ms % 3_600_000) / 60_000);
  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

const TRANSITION_ROWS: { key: keyof TransitionMetrics; label: string }[] = [
  { key: 'outageToMaintenance', label: 'Outage \u2192 Maintenance' },
  { key: 'maintenanceToOperational', label: 'Maintenance \u2192 Operational' },
  { key: 'outageToOperational', label: 'Outage \u2192 Operational' },
];

function TransitionTable({ metrics }: { metrics: TransitionMetrics }) {
  const allEmpty = TRANSITION_ROWS.every(r => metrics[r.key].count === 0);

  if (allEmpty) {
    return (
      <div style={styles.noDataBox}>
        No transition data available for this time range.
      </div>
    );
  }

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Transition</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>P50</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>P95</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>P99</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Count</th>
          </tr>
        </thead>
        <tbody>
          {TRANSITION_ROWS.map(row => {
            const m = metrics[row.key];
            return (
              <tr key={row.key}>
                <td style={styles.td}>{row.label}</td>
                <td style={styles.tdValue}>
                  {m.p50 !== null ? formatDuration(m.p50) : '\u2014'}
                </td>
                <td style={styles.tdValue}>
                  {m.p95 !== null ? formatDuration(m.p95) : '\u2014'}
                </td>
                <td style={styles.tdValue}>
                  {m.p99 !== null ? formatDuration(m.p99) : '\u2014'}
                </td>
                <td style={styles.tdValue}>{m.count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Metrics() {
  const navigate = useNavigate();
  const [range, setRange] = useState<Range>('7d');
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [transitionData, setTransitionData] = useState<TransitionTimesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/metrics/service-history?range=${range}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }),
      fetch(`/api/metrics/transition-times?range=${range}`)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        }),
    ])
      .then(([historyJson, transitionJson]: [MetricsResponse, TransitionTimesResponse]) => {
        setData(historyJson);
        setTransitionData(transitionJson);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
        setLoading(false);
      });
  }, [range]);

  // Build stacked bar timeline data
  const timelineBuckets = data ? buildTimeBuckets(data.since, range) : [];
  const timelineRows = data && data.services.length > 0
    ? buildServiceBucketRows(data.services, timelineBuckets)
    : [];

  const hasHistory =
    data !== null &&
    data.services.length > 0 &&
    data.services.some(s => s.history.length > 0);

  const trends = data && hasHistory ? computeTrends(data.services, data.since) : null;

  // Compute overall uptime across all services
  const overallUptime =
    trends && trends.uptimeByService.length > 0
      ? Math.round(
          (trends.uptimeByService.reduce((sum, s) => sum + s.uptime, 0) /
            trends.uptimeByService.length) *
            10
        ) / 10
      : null;

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Service Metrics</h1>
        </div>
        <div style={styles.headerRight}>
          <button
            style={{ ...headerBtn, ...headerBtnSecondary }}
            onClick={() => navigate('/admin')}
          >
            ← Admin
          </button>
          <button
            style={{ ...headerBtn, ...headerBtnSecondary }}
            onClick={() => navigate('/')}
          >
            ← Dashboard
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={styles.body}>
        {/* Time Range Selector */}
        <div style={styles.rangeRow}>
          <span style={styles.rangeLabel}>Time range:</span>
          {(['24h', '7d', '30d'] as Range[]).map(r => (
            <button
              key={r}
              style={range === r ? styles.rangeBtnActive : styles.rangeBtn}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>

        {loading && (
          <div style={styles.centered}>Loading metrics...</div>
        )}

        {!loading && error && (
          <div style={styles.errorBox}>
            Failed to load metrics: {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* 1. Trend Insight Cards (KPIs) */}
            {trends ? (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Trend Insights</h2>
                <div style={styles.kpiGrid}>
                  {/* Overall Uptime */}
                  <div style={styles.kpiCard}>
                    <div style={styles.kpiLabel}>Overall Uptime</div>
                    <div
                      style={{
                        ...styles.kpiValue,
                        color:
                          overallUptime !== null && overallUptime >= 99
                            ? '#059669'
                            : overallUptime !== null && overallUptime >= 95
                            ? '#ea580c'
                            : '#e11d48',
                      }}
                    >
                      {overallUptime !== null ? `${overallUptime}%` : '—'}
                    </div>
                    <div style={styles.kpiSub}>across all services</div>
                  </div>

                  {/* Total Incidents */}
                  <div style={styles.kpiCard}>
                    <div style={styles.kpiLabel}>Total Incidents</div>
                    <div
                      style={{
                        ...styles.kpiValue,
                        color: trends.totalIncidents === 0 ? '#059669' : '#e11d48',
                      }}
                    >
                      {trends.totalIncidents}
                    </div>
                    <div style={styles.kpiSub}>outage transitions</div>
                  </div>

                  {/* Avg Recovery Time */}
                  <div style={styles.kpiCard}>
                    <div style={styles.kpiLabel}>Avg Recovery Time</div>
                    <div style={{ ...styles.kpiValue, color: '#2563eb' }}>
                      {trends.avgRecoveryMs !== null
                        ? formatDuration(trends.avgRecoveryMs)
                        : '—'}
                    </div>
                    <div style={styles.kpiSub}>outage → operational</div>
                  </div>

                  {/* Best Uptime Service */}
                  {trends.uptimeByService.length > 0 && (
                    <div style={styles.kpiCard}>
                      <div style={styles.kpiLabel}>Best Uptime</div>
                      <div style={{ ...styles.kpiValue, color: '#059669', fontSize: '22px' }}>
                        {
                          trends.uptimeByService.reduce((best, s) =>
                            s.uptime > best.uptime ? s : best
                          ).name
                        }
                      </div>
                      <div style={styles.kpiSub}>
                        {
                          trends.uptimeByService.reduce((best, s) =>
                            s.uptime > best.uptime ? s : best
                          ).uptime
                        }
                        % uptime
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              data.services.length > 0 && (
                <section style={styles.section}>
                  <h2 style={styles.sectionTitle}>Trend Insights</h2>
                  <div style={styles.noDataBox}>
                    No status history recorded yet. Trend insights will appear here as status changes occur.
                  </div>
                </section>
              )
            )}

            {/* 2. Pie + Bar Charts side by side */}
            {trends && (trends.statusDistribution.length > 0 || trends.incidentsByService.length > 0) && (
              <div style={styles.chartsRow}>
                {/* Status Distribution Pie */}
                {trends.statusDistribution.length > 0 && (
                  <section style={{ ...styles.section, flex: 1 }}>
                    <h2 style={styles.sectionTitle}>Status Distribution</h2>
                    <p style={styles.chartSubtitle}>Time spent in each status (all services, {range})</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={trends.statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={2}
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}%`}
                          labelLine={true}
                        >
                          {trends.statusDistribution.map(entry => (
                            <Cell
                              key={entry.name}
                              fill={STATUS_COLORS[entry.name] ?? '#9e9e9e'}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [`${value}%`, 'Time share']}
                          contentStyle={{
                            backgroundColor: '#fff',
                            borderColor: '#ddd',
                            borderRadius: '6px',
                            fontSize: '13px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </section>
                )}

                {/* Incidents Bar Chart */}
                {trends.incidentsByService.some(s => s.incidents > 0) && (
                  <section style={{ ...styles.section, flex: 1 }}>
                    <h2 style={styles.sectionTitle}>Incidents by Service</h2>
                    <p style={styles.chartSubtitle}>Outage count per service ({range})</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={trends.incidentsByService}
                        margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12, fill: '#666' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 12, fill: '#666' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(value: number) => [value, 'Incidents']}
                          contentStyle={{
                            backgroundColor: '#fff',
                            borderColor: '#ddd',
                            borderRadius: '6px',
                            fontSize: '13px',
                          }}
                        />
                        <Bar dataKey="incidents" radius={[4, 4, 0, 0]}>
                          {trends.incidentsByService.map((entry, idx) => (
                            <Cell
                              key={entry.name}
                              fill={SERVICE_LINE_COLORS[idx % SERVICE_LINE_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </section>
                )}
              </div>
            )}

            {/* 3. Response Time Percentiles */}
            {transitionData && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Response Time Percentiles</h2>
                <p style={styles.chartSubtitle}>
                  How long status transitions take across all services ({range})
                </p>

                {/* Aggregate Table */}
                <TransitionTable metrics={transitionData.aggregate} />

                {/* Per-Service Breakdown */}
                {Object.keys(transitionData.byService).length > 0 && (
                  <div style={{ marginTop: '24px' }}>
                    <h3 style={styles.transitionSubheading}>By Service</h3>
                    {Object.entries(transitionData.byService).map(([serviceName, metrics]) => {
                      const hasData =
                        metrics.outageToMaintenance.count > 0 ||
                        metrics.maintenanceToOperational.count > 0 ||
                        metrics.outageToOperational.count > 0;
                      if (!hasData) return null;
                      return (
                        <div key={serviceName} style={styles.serviceTransitionBlock}>
                          <h4 style={styles.serviceTransitionName}>{serviceName}</h4>
                          <TransitionTable metrics={metrics} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* 4. Status Timeline (Stacked Bar Chart) */}
            <section style={styles.section}>
              <h2 style={styles.sectionTitle}>Status Timeline</h2>
              <p style={styles.chartSubtitle}>
                Service health over time — each row shows operational vs. problem periods ({range})
              </p>

              {/* Legend */}
              <div style={styles.legendRow}>
                {(Object.entries(BUCKET_STATUS_COLORS) as [BucketStatus, string][])
                  .filter(([s]) => s !== 'Unknown')
                  .map(([status, color]) => (
                    <div key={status} style={styles.legendItem}>
                      <span
                        style={{
                          ...styles.legendDot,
                          backgroundColor: status === 'Operational' ? color + 'cc' : color,
                        }}
                      />
                      <span style={styles.legendLabel}>{status}</span>
                    </div>
                  ))}
              </div>

              {!hasHistory ? (
                <div style={styles.noDataBox}>
                  No status history recorded yet. Status changes will appear here as they occur.
                </div>
              ) : (
                <StatusTimelineChart rows={timelineRows} buckets={timelineBuckets} />
              )}
            </section>

            {/* 5. Per-Service Mini Charts */}
            {hasHistory && data.services.length > 1 && (
              <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Per-Service Breakdown</h2>
                <div style={styles.miniChartsGrid}>
                  {data.services
                    .filter(svc => svc.history.length > 0)
                    .map((svc, idx) => {
                      const svcData = svc.history
                        .slice()
                        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
                        .map(h => ({
                          timestamp: h.timestamp,
                          status: statusToValue(h.status),
                        }));
                      const color = SERVICE_LINE_COLORS[idx % SERVICE_LINE_COLORS.length];
                      return (
                        <div key={svc.id} style={styles.miniChartCard}>
                          <div style={styles.miniChartHeader}>
                            <span style={{ ...styles.miniChartDot, backgroundColor: color }} />
                            <span style={styles.miniChartName}>{svc.name}</span>
                            <StatusBadge status={svc.currentStatus} />
                          </div>
                          <ResponsiveContainer width="100%" height={110}>
                            <LineChart
                              data={svcData}
                              margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                            >
                              <XAxis dataKey="timestamp" hide />
                              <YAxis
                                domain={[0, 2]}
                                ticks={[0, 1, 2]}
                                tickFormatter={yAxisTickFormatter}
                                tick={{ fontSize: 10, fill: '#999' }}
                                width={80}
                              />
                              <Tooltip
                                formatter={(value: number) => [
                                  yAxisTickFormatter(value),
                                  svc.name,
                                ]}
                                labelFormatter={label =>
                                  new Date(label as string).toLocaleString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                }
                                contentStyle={{
                                  fontSize: '11px',
                                  borderRadius: '4px',
                                }}
                              />
                              <Line
                                type="stepAfter"
                                dataKey="status"
                                stroke={color}
                                strokeWidth={2}
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <footer style={styles.footer}>
        Brought to you by{' '}
        <a
          href="https://github.com/gm2211"
          style={{ color: 'var(--theme-color-primary-500)' }}
          target="_blank"
          rel="noopener noreferrer"
        >
          gm2211
        </a>
      </footer>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#f5f7fa',
    fontFamily: 'Nunito, sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    background: 'linear-gradient(135deg, var(--theme-header-gradient-start) 0%, var(--theme-header-gradient-end) 100%)',
    padding: '14px 28px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    fontSize: '22px',
    fontWeight: 600,
    color: '#fff',
    margin: 0,
    letterSpacing: '0.01em',
  },
  headerRight: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  body: {
    flex: 1,
    maxWidth: '960px',
    width: '100%',
    margin: '0 auto',
    padding: '28px 24px',
    boxSizing: 'border-box',
  },
  rangeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '24px',
  },
  rangeLabel: {
    fontSize: '14px',
    color: '#555',
    fontWeight: 600,
    marginRight: '4px',
  },
  rangeBtn: {
    padding: '6px 18px',
    borderRadius: '20px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ccc',
    background: '#fff',
    color: '#444',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Nunito, sans-serif',
  },
  rangeBtnActive: {
    padding: '6px 18px',
    borderRadius: '20px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--theme-color-primary-500)',
    background: 'var(--theme-color-primary-500)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'Nunito, sans-serif',
  },
  section: {
    background: '#fff',
    borderRadius: '10px',
    padding: '20px 24px',
    marginBottom: '20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: 'var(--theme-color-primary-500)',
    margin: '0 0 16px 0',
  },
  chartSubtitle: {
    fontSize: '13px',
    color: '#888',
    margin: '-10px 0 12px 0',
  },
  // KPI / Trend insight cards
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px',
  },
  kpiCard: {
    background: '#f9fafb',
    borderRadius: '8px',
    padding: '16px 18px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  kpiLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: 800,
    color: '#111827',
    lineHeight: 1.1,
  },
  kpiSub: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '2px',
  },
  // Side-by-side pie + bar row
  chartsRow: {
    display: 'flex',
    gap: '20px',
    marginBottom: '0',
  },
  legendRow: {
    display: 'flex',
    gap: '20px',
    marginBottom: '16px',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  legendLabel: {
    fontSize: '13px',
    color: '#555',
  },
  chartWrap: {
    marginTop: '8px',
  },
  noDataBox: {
    background: '#f9f9f9',
    borderRadius: '8px',
    padding: '24px',
    textAlign: 'center',
    color: '#888',
    fontSize: '14px',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: '#ddd',
  },
  miniChartsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  miniChartCard: {
    background: '#fafafa',
    borderRadius: '8px',
    padding: '12px 14px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#eee',
  },
  miniChartHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  miniChartDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  miniChartName: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#333',
    flex: 1,
  },
  centered: {
    textAlign: 'center',
    color: '#888',
    padding: '60px 0',
    fontSize: '15px',
  },
  errorBox: {
    background: '#fff5f5',
    borderRadius: '8px',
    padding: '16px 20px',
    color: '#c62828',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#ffcdd2',
    fontSize: '14px',
    marginBottom: '20px',
  },
  // Transition percentile table styles
  tableWrap: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  th: {
    padding: '10px 12px',
    fontSize: '11px',
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid' as const,
    borderBottomColor: '#e5e7eb',
    textAlign: 'left' as const,
  },
  td: {
    padding: '10px 12px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid' as const,
    borderBottomColor: '#f3f4f6',
    color: '#374151',
    fontWeight: 600,
  },
  tdValue: {
    padding: '10px 12px',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid' as const,
    borderBottomColor: '#f3f4f6',
    color: 'var(--theme-color-primary-500)',
    fontWeight: 700,
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  transitionSubheading: {
    fontSize: '14px',
    fontWeight: 700,
    color: '#374151',
    margin: '0 0 12px 0',
  },
  serviceTransitionBlock: {
    marginBottom: '16px',
    padding: '12px 16px',
    background: '#f9fafb',
    borderRadius: '8px',
    borderWidth: '1px',
    borderStyle: 'solid' as const,
    borderColor: '#e5e7eb',
  },
  serviceTransitionName: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--theme-color-primary-500)',
    margin: '0 0 8px 0',
  },
  footer: {
    textAlign: 'center',
    padding: '20px 0 12px',
    fontSize: '11px',
    color: '#999',
  },
};
