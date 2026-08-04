/**
 * A partner's merchant dashboard, Next.js App Router.
 *
 * This file is a **server** component. It does the one thing that has to happen on a server:
 * calling Onramp with the partner's credential. The browser never sees that credential and never
 * makes a cross-origin request — the card renders configuration it was handed.
 *
 * Not wired to a build. It is here to be read and copied.
 */

import { CapitalPanel } from './capital-panel';
import type { MountConfig } from '@onrampfunds/embed-react';

/**
 * Stands in for the partner's own data layer.
 */
declare function getCurrentMerchant(): Promise<{
  id: string;
  operatingState: string;
  trailingMonthlySalesCents: number;
}>;

async function fetchPrequalification(merchant: {
  id: string;
  operatingState: string;
  trailingMonthlySalesCents: number;
}): Promise<MountConfig> {
  const response = await fetch('https://onrampfunds.com/partners/api/prequalifications', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.ONRAMP_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      merchant_id: merchant.id,
      // Required: the merchant's state decides which product applies, and therefore which
      // vocabulary the card must use. An unsupported state comes back with no amount.
      state: merchant.operatingState,
      monthly_sales_cents: merchant.trailingMonthlySalesCents,
    }),
    // Your caching is your call. Onramp counts each of these calls as an impression, so caching
    // trades reporting granularity for latency — worth choosing deliberately rather than by
    // default.
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    // Render the page without the card rather than failing it. A merchant's dashboard should not
    // break because a financing panel is unavailable.
    throw new Error(`prequalification failed: ${response.status}`);
  }

  // amount, currency, validUntil, applyUrl, lexicon, copy and theme all come back from here.
  // Forward the whole thing — do not pick fields out of it.
  return response.json() as Promise<MountConfig>;
}

export default async function DashboardPage() {
  const merchant = await getCurrentMerchant();

  let prequalification: MountConfig | null = null;
  try {
    prequalification = await fetchPrequalification(merchant);
  } catch {
    prequalification = null;
  }

  return (
    <main>
      {/* the partner's own content */}
      <CapitalPanel prequalification={prequalification} />
      {/* more of the partner's own content */}
    </main>
  );
}
