import { describe, it, expect } from 'vitest';
import { determineSaleStatus } from '../../src/services/sale.service.js';

describe('determineSaleStatus', () => {
  const start = new Date('2026-05-08T10:00:00Z');
  const end = new Date('2026-05-08T11:00:00Z');

  it('returns "upcoming" when current time is before start', () => {
    const now = new Date('2026-05-08T09:00:00Z');
    expect(determineSaleStatus(now, start, end, 100)).toBe('upcoming');
  });

  it('returns "active" when current time is within sale window and stock > 0', () => {
    const now = new Date('2026-05-08T10:30:00Z');
    expect(determineSaleStatus(now, start, end, 50)).toBe('active');
  });

  it('returns "active" at exact start time', () => {
    expect(determineSaleStatus(start, start, end, 100)).toBe('active');
  });

  it('returns "active" at exact end time with stock', () => {
    expect(determineSaleStatus(end, start, end, 1)).toBe('active');
  });

  it('returns "ended" when current time is after end', () => {
    const now = new Date('2026-05-08T12:00:00Z');
    expect(determineSaleStatus(now, start, end, 50)).toBe('ended');
  });

  it('returns "ended" when stock is 0 even within sale window', () => {
    const now = new Date('2026-05-08T10:30:00Z');
    expect(determineSaleStatus(now, start, end, 0)).toBe('ended');
  });

  it('returns "upcoming" when stock is 0 but sale has not started', () => {
    const now = new Date('2026-05-08T09:00:00Z');
    expect(determineSaleStatus(now, start, end, 0)).toBe('upcoming');
  });
});
