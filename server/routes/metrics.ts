/**
 * Metrics API Routes - Service status history queries.
 *
 * Provides aggregated historical data from ServiceStatusLog for admin dashboards.
 *
 * ROUTES:
 * - GET /api/metrics/service-history?range=24h|7d|30d
 * - GET /api/metrics/transition-times?range=24h|7d|30d|all
 *
 * ACCESS: ADMIN only (enforced in app.ts via requireMinRole)
 *
 * RELATED FILES:
 * - prisma/schema.prisma - ServiceStatusLog model
 * - server/routes/services.ts - Writes to ServiceStatusLog on status changes
 */
import { Router } from 'express';
import prisma from '../db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/metrics/service-history?range=24h|7d|30d
router.get('/service-history', asyncHandler(async (req, res) => {
  const range = (req.query.range as string) || '7d';
  const now = new Date();
  let since: Date;

  switch (range) {
    case '24h': since = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
    case '30d': since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    case '7d':
    default: since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
  }

  const services = await prisma.service.findMany({
    where: { markedForDeletion: false },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true, status: true }
  });

  const logs = await prisma.serviceStatusLog.findMany({
    where: { timestamp: { gte: since } },
    orderBy: { timestamp: 'asc' }
  });

  // Group logs by serviceId
  const logsByService = new Map<number, Array<{ timestamp: Date; status: string }>>();
  for (const log of logs) {
    if (!logsByService.has(log.serviceId)) logsByService.set(log.serviceId, []);
    logsByService.get(log.serviceId)!.push({ timestamp: log.timestamp, status: log.status });
  }

  const result = services.map(s => ({
    id: s.id,
    name: s.name,
    currentStatus: s.status,
    history: logsByService.get(s.id) || []
  }));

  res.json({ services: result, range, since: since.toISOString() });
}));

// ---- Percentile helpers ----

type PercentileMetrics = {
  p50: number | null;
  p95: number | null;
  p99: number | null;
  count: number;
};

function computePercentiles(durations: number[]): PercentileMetrics {
  const count = durations.length;
  if (count === 0) return { p50: null, p95: null, p99: null, count: 0 };

  const sorted = durations.slice().sort((a, b) => a - b);
  const p50 = sorted[Math.ceil(0.50 * count) - 1];
  const p95 = sorted[Math.ceil(0.95 * count) - 1];
  const p99 = sorted[Math.ceil(0.99 * count) - 1];

  return { p50, p95, p99, count };
}

type TransitionMetrics = {
  outageToMaintenance: PercentileMetrics;
  maintenanceToOperational: PercentileMetrics;
  outageToOperational: PercentileMetrics;
};

function computeTransitionMetrics(
  logs: Array<{ timestamp: Date; status: string }>
): TransitionMetrics {
  const outageToMaintenanceDurations: number[] = [];
  const maintenanceToOperationalDurations: number[] = [];
  const outageToOperationalDurations: number[] = [];

  // Walk through log entries chronologically for a single service
  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];

    if (entry.status === 'Outage') {
      // Look forward for Maintenance and Operational transitions
      let foundMaintenance = false;
      for (let j = i + 1; j < logs.length; j++) {
        if (logs[j].status === 'Maintenance' && !foundMaintenance) {
          outageToMaintenanceDurations.push(
            logs[j].timestamp.getTime() - entry.timestamp.getTime()
          );
          foundMaintenance = true;
        }
        if (logs[j].status === 'Operational') {
          outageToOperationalDurations.push(
            logs[j].timestamp.getTime() - entry.timestamp.getTime()
          );
          break;
        }
        // If we hit another Outage, stop looking for this outage's transitions
        if (logs[j].status === 'Outage') break;
      }
    }

    if (entry.status === 'Maintenance') {
      // Look forward for Operational transition
      for (let j = i + 1; j < logs.length; j++) {
        if (logs[j].status === 'Operational') {
          maintenanceToOperationalDurations.push(
            logs[j].timestamp.getTime() - entry.timestamp.getTime()
          );
          break;
        }
        // If we hit another Maintenance or Outage, stop
        if (logs[j].status === 'Maintenance' || logs[j].status === 'Outage') break;
      }
    }
  }

  return {
    outageToMaintenance: computePercentiles(outageToMaintenanceDurations),
    maintenanceToOperational: computePercentiles(maintenanceToOperationalDurations),
    outageToOperational: computePercentiles(outageToOperationalDurations),
  };
}

// GET /api/metrics/transition-times?range=24h|7d|30d|all
router.get('/transition-times', asyncHandler(async (req, res) => {
  const range = (req.query.range as string) || '30d';
  const now = new Date();

  // Build the time filter
  const whereClause: { timestamp?: { gte: Date } } = {};
  if (range !== 'all') {
    let since: Date;
    switch (range) {
      case '24h': since = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
      case '7d': since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d':
      default: since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    }
    whereClause.timestamp = { gte: since };
  }

  // Fetch services and logs
  const services = await prisma.service.findMany({
    where: { markedForDeletion: false },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, name: true },
  });

  const logs = await prisma.serviceStatusLog.findMany({
    where: whereClause,
    orderBy: [{ serviceId: 'asc' }, { timestamp: 'asc' }],
  });

  // Group logs by serviceId
  const logsByService = new Map<number, Array<{ timestamp: Date; status: string }>>();
  for (const log of logs) {
    if (!logsByService.has(log.serviceId)) logsByService.set(log.serviceId, []);
    logsByService.get(log.serviceId)!.push({ timestamp: log.timestamp, status: log.status });
  }

  // Build a name map
  const nameMap = new Map<number, string>();
  for (const svc of services) {
    nameMap.set(svc.id, svc.name);
  }

  // Per-service metrics + collect all durations for aggregate
  const allOutageToMaint: number[] = [];
  const allMaintToOp: number[] = [];
  const allOutageToOp: number[] = [];

  const byService: Record<string, TransitionMetrics> = {};

  for (const svc of services) {
    const svcLogs = logsByService.get(svc.id) || [];
    const metrics = computeTransitionMetrics(svcLogs);
    byService[svc.name] = metrics;

    // Collect durations for aggregate (re-walk the logs to get raw durations)
    for (let i = 0; i < svcLogs.length; i++) {
      const entry = svcLogs[i];

      if (entry.status === 'Outage') {
        let foundMaintenance = false;
        for (let j = i + 1; j < svcLogs.length; j++) {
          if (svcLogs[j].status === 'Maintenance' && !foundMaintenance) {
            allOutageToMaint.push(svcLogs[j].timestamp.getTime() - entry.timestamp.getTime());
            foundMaintenance = true;
          }
          if (svcLogs[j].status === 'Operational') {
            allOutageToOp.push(svcLogs[j].timestamp.getTime() - entry.timestamp.getTime());
            break;
          }
          if (svcLogs[j].status === 'Outage') break;
        }
      }

      if (entry.status === 'Maintenance') {
        for (let j = i + 1; j < svcLogs.length; j++) {
          if (svcLogs[j].status === 'Operational') {
            allMaintToOp.push(svcLogs[j].timestamp.getTime() - entry.timestamp.getTime());
            break;
          }
          if (svcLogs[j].status === 'Maintenance' || svcLogs[j].status === 'Outage') break;
        }
      }
    }
  }

  const aggregate: TransitionMetrics = {
    outageToMaintenance: computePercentiles(allOutageToMaint),
    maintenanceToOperational: computePercentiles(allMaintToOp),
    outageToOperational: computePercentiles(allOutageToOp),
  };

  res.json({ aggregate, byService });
}));

export default router;
