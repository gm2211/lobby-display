import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { PrismaClient, ParcelStatus } from '@prisma/client';

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/renzo_test';

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

beforeEach(async () => {
  await prisma.parcel.deleteMany();
});

afterAll(async () => {
  await prisma.parcel.deleteMany();
  await prisma.$disconnect();
});

describe('Parcel model', () => {
  it('ParcelStatus enum has RECEIVED, NOTIFIED, PICKED_UP values', () => {
    expect(ParcelStatus.RECEIVED).toBe('RECEIVED');
    expect(ParcelStatus.NOTIFIED).toBe('NOTIFIED');
    expect(ParcelStatus.PICKED_UP).toBe('PICKED_UP');
  });

  it('can create a Parcel with required fields', async () => {
    const parcel = await prisma.parcel.create({
      data: {
        description: 'Large box from Amazon',
        recipientId: 'user-123',
        unitNumber: '4B',
        status: 'RECEIVED',
        receivedBy: 'staff-456',
      },
    });

    expect(parcel.id).toBeDefined();
    expect(parcel.description).toBe('Large box from Amazon');
    expect(parcel.recipientId).toBe('user-123');
    expect(parcel.unitNumber).toBe('4B');
    expect(parcel.status).toBe('RECEIVED');
    expect(parcel.receivedBy).toBe('staff-456');
    expect(parcel.receivedAt).toBeInstanceOf(Date);
    expect(parcel.markedForDeletion).toBe(false);
    expect(parcel.createdAt).toBeInstanceOf(Date);
    expect(parcel.updatedAt).toBeInstanceOf(Date);
  });

  it('has optional fields defaulting to null', async () => {
    const parcel = await prisma.parcel.create({
      data: {
        description: 'Package',
        recipientId: 'user-001',
        unitNumber: '2A',
        status: 'RECEIVED',
        receivedBy: 'staff-001',
      },
    });

    expect(parcel.trackingNumber).toBeNull();
    expect(parcel.carrier).toBeNull();
    expect(parcel.pickedUpAt).toBeNull();
    expect(parcel.photoId).toBeNull();
    expect(parcel.notes).toBeNull();
  });

  it('can create a Parcel with all optional fields set', async () => {
    const now = new Date();
    const parcel = await prisma.parcel.create({
      data: {
        trackingNumber: '1Z999AA10123456784',
        carrier: 'UPS',
        description: 'Electronics package',
        recipientId: 'user-789',
        unitNumber: '10C',
        status: 'PICKED_UP',
        receivedBy: 'staff-789',
        pickedUpAt: now,
        photoId: 'upload-abc-123',
        notes: 'Left at front desk',
        markedForDeletion: false,
      },
    });

    expect(parcel.trackingNumber).toBe('1Z999AA10123456784');
    expect(parcel.carrier).toBe('UPS');
    expect(parcel.description).toBe('Electronics package');
    expect(parcel.status).toBe('PICKED_UP');
    expect(parcel.photoId).toBe('upload-abc-123');
    expect(parcel.notes).toBe('Left at front desk');
    expect(parcel.pickedUpAt).toBeInstanceOf(Date);
  });

  it('id is a UUID string', async () => {
    const parcel = await prisma.parcel.create({
      data: {
        description: 'Test parcel',
        recipientId: 'user-uuid-test',
        unitNumber: '5D',
        status: 'NOTIFIED',
        receivedBy: 'staff-uuid-test',
      },
    });

    expect(parcel.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('markedForDeletion defaults to false', async () => {
    const parcel = await prisma.parcel.create({
      data: {
        description: 'Default deletion test',
        recipientId: 'user-del-test',
        unitNumber: '1A',
        status: 'RECEIVED',
        receivedBy: 'staff-del-test',
      },
    });

    expect(parcel.markedForDeletion).toBe(false);
  });

  it('can soft-delete a parcel using markedForDeletion', async () => {
    const parcel = await prisma.parcel.create({
      data: {
        description: 'To be deleted',
        recipientId: 'user-soft-del',
        unitNumber: '3F',
        status: 'RECEIVED',
        receivedBy: 'staff-soft-del',
      },
    });

    const updated = await prisma.parcel.update({
      where: { id: parcel.id },
      data: { markedForDeletion: true },
    });

    expect(updated.markedForDeletion).toBe(true);
  });

  it('can update status from RECEIVED to NOTIFIED to PICKED_UP', async () => {
    const parcel = await prisma.parcel.create({
      data: {
        description: 'Status flow test',
        recipientId: 'user-flow',
        unitNumber: '7G',
        status: 'RECEIVED',
        receivedBy: 'staff-flow',
      },
    });

    const notified = await prisma.parcel.update({
      where: { id: parcel.id },
      data: { status: 'NOTIFIED' },
    });
    expect(notified.status).toBe('NOTIFIED');

    const now = new Date();
    const pickedUp = await prisma.parcel.update({
      where: { id: parcel.id },
      data: { status: 'PICKED_UP', pickedUpAt: now },
    });
    expect(pickedUp.status).toBe('PICKED_UP');
    expect(pickedUp.pickedUpAt).toBeInstanceOf(Date);
  });

  it('can find parcels by recipientId', async () => {
    await prisma.parcel.createMany({
      data: [
        {
          description: 'Package 1',
          recipientId: 'user-find-test',
          unitNumber: '2B',
          status: 'RECEIVED',
          receivedBy: 'staff-001',
        },
        {
          description: 'Package 2',
          recipientId: 'user-find-test',
          unitNumber: '2B',
          status: 'NOTIFIED',
          receivedBy: 'staff-001',
        },
        {
          description: 'Package 3',
          recipientId: 'other-user',
          unitNumber: '5C',
          status: 'RECEIVED',
          receivedBy: 'staff-001',
        },
      ],
    });

    const parcels = await prisma.parcel.findMany({
      where: { recipientId: 'user-find-test' },
    });

    expect(parcels).toHaveLength(2);
  });
});
