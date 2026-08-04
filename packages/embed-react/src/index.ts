/**
 * `@onrampfunds/embed-react` — placeholder.
 *
 * This `0.0.1` exists to lock the package name and to prove the release pipeline publishes both
 * packages at the same version, before anyone depends on either. The wrapper itself — a component
 * around a ref and an effect, with correct cleanup, stable callback identity, and strict-mode
 * safety — is CTO-344.
 *
 * Until then, use the core library directly. It is a `useEffect` and a `ref`:
 *
 * ```tsx
 * import { useEffect, useRef } from 'react';
 * import { mount } from '@onrampfunds/embed';
 *
 * function CapitalCard(props: { config: MountConfig }) {
 *   const slot = useRef<HTMLDivElement>(null);
 *   useEffect(() => {
 *     if (slot.current === null) return;
 *     const card = mount(slot.current, props.config);
 *     return () => card?.unmount();
 *   }, [props.config]);
 *   return <div ref={slot} />;
 * }
 * ```
 */

export { version as coreVersion } from '@onrampfunds/embed';

/** The version of this package. Matches the core it is pinned to. */
export const version = '0.0.2';
