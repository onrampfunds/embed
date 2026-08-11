import { describe, expect, it } from 'vitest';
import { fieldsBesideData, isThenable, mergeResolved } from '../src/data';
import { normalize } from '../src/config';
import { validConfig } from './helpers';

describe('isThenable', () => {
  it('accepts a native promise', () => {
    expect(isThenable(Promise.resolve({}))).toBe(true);
  });

  it('accepts a bare thenable, which is what a cross-realm promise looks like', () => {
    expect(isThenable({ then: () => undefined })).toBe(true);
  });

  it.each([[null], [undefined], [42], ['pending'], [{}], [{ then: 'soon' }]])(
    'refuses %j',
    (value) => {
      expect(isThenable(value)).toBe(false);
    },
  );
});

describe('fieldsBesideData', () => {
  it('is empty for page-side keys', () => {
    expect(
      fieldsBesideData({ data: Promise.resolve({}), theme: { accent: '#000' }, state: 'mounting' }),
    ).toEqual([]);
  });

  it('names every data-bearing field passed inline', () => {
    expect(
      fieldsBesideData({ data: Promise.resolve({}), amount: 40000, copy: { qualifier: 'x' } }),
    ).toEqual(['amount', 'copy']);
  });

  it('counts an explicit undefined as absent, matching how mount() treats every option', () => {
    expect(fieldsBesideData({ data: Promise.resolve({}), amount: undefined })).toEqual([]);
  });
});

describe('mergeResolved', () => {
  const onEvent = (): void => undefined;

  it('starts from the payload and overlays the page-side keys', () => {
    const merged = mergeResolved(
      { onEvent, locale: 'en-GB', partnerName: 'Cartwheel' },
      validConfig(),
    );
    expect(merged.amount).toBe(40000);
    expect(merged.applyUrl).toBe('https://onrampfunds.com/p/abc123');
    expect(merged.onEvent).toBe(onEvent);
    expect(merged.locale).toBe('en-GB');
    expect(merged.partnerName).toBe('Cartwheel');
  });

  it('merges theme per token, mount-passed tokens winning', () => {
    const merged = mergeResolved(
      { theme: { accent: '#5B21B6' } },
      validConfig({ theme: { accent: '#111111', radius: 12 } }),
    );
    expect(merged.theme).toEqual({ accent: '#5B21B6', radius: 12 });
  });

  it('drops state and data from the payload — pending presentation is a page-side concern', () => {
    const merged = mergeResolved({}, { ...validConfig(), state: 'mounting', data: Promise.resolve({}) });
    expect(merged.state).toBeUndefined();
    expect(merged.data).toBeUndefined();
  });

  it('never carries the page-side pending state past the resolve', () => {
    const merged = mergeResolved({ state: 'mounting' }, validConfig());
    expect(merged.state).toBeUndefined();
  });

  it('passes a non-object payload through untouched, so normalize() explains it', () => {
    expect(mergeResolved({}, 'nope')).toBe('nope');
  });
});

describe('normalize with a data key', () => {
  it('refuses it — data is only accepted at mount()', () => {
    const result = normalize({ ...validConfig(), data: Promise.resolve({}) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('data is only accepted at mount()');
  });
});
