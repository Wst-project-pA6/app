import { computeFilterFingerprint } from './filter-fingerprint.util';

describe('computeFilterFingerprint', () => {
  it('is deterministic for identical filters and scope', () => {
    const filters = { from: '2026-01-01T00:00:00Z', storeId: 'store-1' };
    const a = computeFilterFingerprint(filters, ['scope-1', 'scope-2']);
    const b = computeFilterFingerprint(filters, ['scope-1', 'scope-2']);
    expect(a).toBe(b);
  });

  it('is a 64-character hex string (sha256), matching the export_jobs.filter_fingerprint CHAR(64) column', () => {
    const fingerprint = computeFilterFingerprint({}, ['scope-1']);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is independent of scope array order', () => {
    const a = computeFilterFingerprint({}, ['scope-2', 'scope-1']);
    const b = computeFilterFingerprint({}, ['scope-1', 'scope-2']);
    expect(a).toBe(b);
  });

  it('changes when a filter value changes', () => {
    const a = computeFilterFingerprint({ storeId: 'store-1' }, ['scope-1']);
    const b = computeFilterFingerprint({ storeId: 'store-2' }, ['scope-1']);
    expect(a).not.toBe(b);
  });

  it('changes when the effective scope changes', () => {
    const a = computeFilterFingerprint({}, ['scope-1']);
    const b = computeFilterFingerprint({}, ['scope-1', 'scope-2']);
    expect(a).not.toBe(b);
  });

  it('treats undefined and omitted filter fields identically', () => {
    const a = computeFilterFingerprint({ from: undefined }, ['scope-1']);
    const b = computeFilterFingerprint({}, ['scope-1']);
    expect(a).toBe(b);
  });
});
