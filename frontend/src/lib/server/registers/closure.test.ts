import { describe, it, expect, vi } from 'vitest';
import { monthKey, isMonthClosed, type ClosureClient } from './closure';

function fakeClient(closure: { id: string } | null): ClosureClient {
  return {
    registerClosure: { findUnique: vi.fn().mockResolvedValue(closure) },
  } as unknown as ClosureClient;
}

describe('monthKey', () => {
  it('formats as YYYY-MM, zero-padded', () => {
    expect(monthKey(new Date('2026-01-15T00:00:00'))).toBe('2026-01');
    expect(monthKey(new Date('2026-11-03T00:00:00'))).toBe('2026-11');
  });
});

describe('isMonthClosed', () => {
  it('returns false when no closure row exists', async () => {
    const client = fakeClient(null);
    const result = await isMonthClosed(
      client,
      'org-1',
      'consultation',
      new Date('2026-01-15T00:00:00'),
    );
    expect(result).toBe(false);
  });

  it('returns true when a closure row exists', async () => {
    const client = fakeClient({ id: 'rc-1' });
    const result = await isMonthClosed(
      client,
      'org-1',
      'consultation',
      new Date('2026-01-15T00:00:00'),
    );
    expect(result).toBe(true);
  });

  it('looks up by the composite organizationId_registerType_month key', async () => {
    const client = fakeClient(null);
    await isMonthClosed(client, 'org-1', 'consultation', new Date('2026-03-20T00:00:00'));
    const findUniqueMock = client.registerClosure.findUnique as ReturnType<typeof vi.fn>;
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: {
        organizationId_registerType_month: {
          organizationId: 'org-1',
          registerType: 'consultation',
          month: '2026-03',
        },
      },
      select: { id: true },
    });
  });
});
