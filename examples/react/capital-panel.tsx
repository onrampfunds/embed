'use client';

/**
 * The client half. `mount()` needs a DOM, so this is the boundary — but note how little there is
 * to it: the wrapper handles the lifecycle, and the partner's job is deciding what fills the slot
 * when there is no card to show.
 */

import { OnrampPrequalification, type MountConfig } from '@onrampfunds/embed-react';

declare function track(event: string, meta: Record<string, unknown>): void;

export function CapitalPanel({ prequalification }: { prequalification: MountConfig | null }) {
  // No amount means this merchant is not prequalified this month, and the fetch failing means we
  // do not know. Both are ordinary — neither is a rejection, and neither should read as one.
  //
  // Branch here rather than letting the card handle it. It deliberately renders nothing in that
  // case, so it cannot tell you; you already have the data on the server, and you get to choose
  // what occupies the space.
  if (prequalification === null || !prequalification.amount) {
    return <WorkingCapitalPromo />;
  }

  return (
    <OnrampPrequalification
      // Forward the response whole: amount, currency, applyUrl, lexicon, copy, theme.
      // `copy` carries the regulated strings and is required — the card renders nothing without
      // it, rather than falling back to wording compliance cannot revise.
      {...prequalification}
      // Yours, not Onramp's. Shown as "for Cartwheel" and names the site being left.
      partnerName="Cartwheel"
      // Applied to the element the card mounts into, so it sits in your own layout.
      className="col-span-4"
      // An inline arrow is fine here, and this is the whole reason the wrapper exists. A new
      // function identity on every parent render does not tear down and rebuild the shadow root.
      onEvent={(name, meta) => track(`onramp:${name}`, meta)}
    />
  );
}

function WorkingCapitalPromo() {
  return (
    <section>
      <h2>Working capital</h2>
      <p>Keep selling — we will let you know when funding is available for your store.</p>
    </section>
  );
}
