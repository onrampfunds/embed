import { useEffect, useRef, type CSSProperties, type ReactElement } from 'react';
import { mount, type MountConfig, type MountHandle } from '@onrampfunds/embed';
import { referenceId, signatureOf } from './signature';

export interface OnrampPrequalificationProps extends MountConfig {
  /** Applied to the element the card mounts into, so it sits in your own layout. */
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders the prequalification card.
 *
 * ```tsx
 * // Direct data — you already fetched the prequalification:
 * <OnrampPrequalification {...prequalification} onEvent={track} />
 *
 * // Or hand it the fetch itself — create the promise once, not per render:
 * const [data] = useState(() => fetch('/api/onramp-prequal').then((r) => r.json()));
 * <OnrampPrequalification data={data} onEvent={track} />
 * ```
 *
 * Every prop except `className` and `style` is the core's mount config, so that package's README
 * is the contract. The core owns everything that matters — the closed shadow root, the state
 * machine, the contrast guard, the copy fallbacks. This component owns one thing: reconciling an
 * imperative mount against React's lifecycle without doing it badly.
 *
 * When there is no amount, or the config is malformed, nothing renders and an empty element is
 * left behind. That is the core's behaviour and it is deliberate — a merchant who does not qualify
 * this month must never see something that reads as a rejection.
 */
export function OnrampPrequalification(props: OnrampPrequalificationProps): ReactElement {
  const { className, style, onEvent, data, ...config } = props;

  const slot = useRef<HTMLDivElement>(null);
  const card = useRef<MountHandle | null>(null);

  // Read at call time rather than captured, so a new inline function on every parent render never
  // reaches the effect below. This indirection is most of the reason the wrapper exists.
  const latestOnEvent = useRef(onEvent);
  latestOnEvent.current = onEvent;

  // Value identity for everything serialisable; reference identity for the promise, which has no
  // value until it settles — and when it settles, the core repaints in place without a remount.
  // The core accepts function-shaped thenables too, so this must match — `data !== null` still
  // guards it, since `typeof null === 'object'` would otherwise make `referenceId(null)` throw.
  const signature =
    data !== null && (typeof data === 'object' || typeof data === 'function')
      ? `${signatureOf(config)}|data:${referenceId(data)}`
      : signatureOf(config);

  useEffect(() => {
    const element = slot.current;
    if (element === null) return undefined;

    card.current = mount(element, {
      ...(config as MountConfig),
      ...(data !== undefined ? { data } : {}),
      onEvent: (name, meta) => {
        latestOnEvent.current?.(name, meta);
      },
    });

    return () => {
      // Runs on unmount and before every remount, including the extra cycle React's strict mode
      // performs in development — which is why the core must be left with nothing behind.
      card.current?.unmount();
      card.current = null;
    };
    // `config` and `data` are deliberately not dependencies: `signature` is their combined
    // identity, and the effect React runs is always the one from the render whose signature
    // changed, so the config and promise this closes over are current.
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={slot} className={className} style={style} />;
}
