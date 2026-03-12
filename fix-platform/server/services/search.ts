import prisma from '../db.js';

export async function indexEntity(
  entityType: string,
  entityId: string,
  title: string,
  body: string,
  metadata?: unknown,
) {
  return prisma.searchIndex.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    update: { title, body, metadata: metadata ?? undefined },
    create: { entityType, entityId, title, body, metadata: metadata ?? undefined },
  });
}

export async function removeIndex(entityType: string, entityId: string) {
  return prisma.searchIndex.deleteMany({
    where: { entityType, entityId },
  });
}

export async function searchEntities(query: string, entityType?: string) {
  const where: Record<string, unknown> = {};
  if (entityType) where.entityType = entityType;
  // Simple LIKE-based search (full-text search would use raw SQL with tsvector)
  where.OR = [
    { title: { contains: query, mode: 'insensitive' } },
    { body: { contains: query, mode: 'insensitive' } },
  ];
  return prisma.searchIndex.findMany({ where, orderBy: { createdAt: 'desc' } });
}
