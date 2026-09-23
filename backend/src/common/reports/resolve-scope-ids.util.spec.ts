import { resolveScopeIds } from './resolve-scope-ids.util';

describe('resolveScopeIds', () => {
  it('returns all allowed scopes when no filter is requested', () => {
    expect(resolveScopeIds(undefined, ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('narrows to the requested scope when it is allowed', () => {
    expect(resolveScopeIds('a', ['a', 'b'])).toEqual(['a']);
  });

  it('returns an empty array (never throws, never widens) when the requested scope is not allowed', () => {
    expect(resolveScopeIds('c', ['a', 'b'])).toEqual([]);
  });

  it('returns an empty array when the caller has no allowed scopes at all', () => {
    expect(resolveScopeIds(undefined, [])).toEqual([]);
  });
});
