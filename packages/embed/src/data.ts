import { isObject } from './config';
import type { MountConfig } from './types';

/**
 * The fields the resolved payload owns exclusively. Everything the server decides — the amount,
 * where applying goes, which vocabulary is compliant, the regulated copy — has exactly one
 * source of truth per mount, and mount-time code must never be able to override regulated copy.
 */
const PAYLOAD_FIELDS = ['amount', 'currency', 'applyUrl', 'lexicon', 'copy'] as const;

/**
 * The thenable duck-type rather than `instanceof Promise`, for the same reason `isObject` avoids
 * prototype checks: a promise from another realm — a micro-frontend handing config across an
 * iframe boundary — is legitimate and fails `instanceof`.
 */
export function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  try {
    return typeof (value as PromiseLike<unknown>).then === 'function';
  } catch {
    // Reading `then` can itself throw — a getter is code. Whatever that object is, it is not a
    // promise, and the exception must not escape mount() into the partner's page.
    return false;
  }
}

/** Data-bearing keys illegally passed beside `data`, in declaration order, for the log line. */
export function fieldsBesideData(config: MountConfig): string[] {
  return PAYLOAD_FIELDS.filter((field) => config[field] !== undefined);
}

/**
 * Folds the settled payload under the mount-time page-side keys.
 *
 * The two sides are disjoint by construction — `fieldsBesideData` refused any overlap at mount —
 * so the merge is mechanical. The one shared key is `theme`, which keeps its existing per-token
 * rule: mount-passed tokens override stored (payload) tokens. `state` and `data` never survive
 * the merge: pending presentation is a page-side concern, and the pending promise is spent.
 *
 * A payload that is not config-shaped passes through untouched. The caller (mount's data handler)
 * validates it separately, logs the error via `fail()`, and emits it via the pageSide's onEvent.
 * This preserves the canonical error message from `normalize()` and ensures non-object payloads
 * are logged and reported, not silently dropped.
 */
export function mergeResolved(pageSide: MountConfig, payload: unknown): MountConfig {
  if (!isObject(payload)) return payload as MountConfig;

  const served = payload as MountConfig;
  const merged: MountConfig = { ...served };
  delete merged.state;
  delete merged.data;

  if (pageSide.onEvent !== undefined) merged.onEvent = pageSide.onEvent;
  if (pageSide.locale !== undefined) merged.locale = pageSide.locale;
  if (pageSide.partnerName !== undefined) merged.partnerName = pageSide.partnerName;
  if (served.theme !== undefined || pageSide.theme !== undefined) {
    merged.theme = { ...served.theme, ...pageSide.theme };
  }
  return merged;
}
