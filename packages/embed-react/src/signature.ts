/**
 * A value-based identity for the mount config.
 *
 * React gives us reference equality, and a partner writing JSX gets a brand new config object on
 * every parent render:
 *
 * ```tsx
 * <OnrampPrequalification amount={amount} onEvent={(n, m) => track(n, m)} />
 * ```
 *
 * Keying the mount effect on those props directly would tear down the shadow root and rebuild it
 * every time anything in the parent re-rendered — a visible flicker on the one surface that is
 * supposed to sit quietly in someone else's dashboard.
 *
 * So the effect is keyed on a string derived from the config's *values* instead. Two objects
 * describing the same card produce the same string, and the card stays put.
 */

/**
 * Functions are skipped deliberately, not incidentally. A callback prop changing identity is the
 * single most common reason a config object is "new", and it never justifies a remount: callbacks
 * are read through a ref at call time, so the mounted card always invokes the latest one.
 */
function normalise(value: unknown): unknown {
  if (typeof value === 'function' || value === undefined) return undefined;

  if (Array.isArray(value)) return value.map(normalise);

  if (value !== null && typeof value === 'object') {
    // Keys sorted, so `{ amount, currency }` and `{ currency, amount }` agree. Object spread and
    // conditional keys make that ordering genuinely unstable in real integrations.
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const normalised = normalise((value as Record<string, unknown>)[key]);
      if (normalised !== undefined) out[key] = normalised;
    }
    return out;
  }

  return value;
}

export function signatureOf(config: unknown): string {
  return JSON.stringify(normalise(config)) ?? '';
}

let nextReferenceId = 1;
const referenceIds = new WeakMap<object, number>();

/**
 * A stable id for values that only have reference identity. A promise has no serialisable value —
 * `normalise` would fold every promise to `{}`, making all of them look like the same config — so
 * the signature carries this id instead: same promise, same signature; new promise, new mount.
 */
export function referenceId(value: object): number {
  let id = referenceIds.get(value);
  if (id === undefined) {
    id = nextReferenceId;
    nextReferenceId += 1;
    referenceIds.set(value, id);
  }
  return id;
}
