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
  email: string;
  operatingState: string;
  shopDomain: string;
  trailing90DaySales: number;
}>;

/**
 * Stands in for your token cache. The JWT comes from
 * `POST https://app.onrampfunds.com/partners/api/tokens` with your `client_id` and
 * `client_secret` — cache it and re-mint on a 401 rather than minting per request.
 */
declare function onrampAccessToken(): Promise<string>;

async function fetchPrequalification(merchant: {
  email: string;
  operatingState: string;
  shopDomain: string;
  trailing90DaySales: number;
}): Promise<MountConfig> {
  // Nested parameters use Rails bracket notation, with `platforms[]` repeated once per
  // platform. Indexed keys (`platforms[0][type]`) are rejected with a 422.
  const query = new URLSearchParams();
  query.append('seller_email', merchant.email);
  // Required: the merchant's state decides which product applies, and therefore which
  // vocabulary the card must use. A state Onramp does not operate in comes back with no amount.
  query.append('operating_state', merchant.operatingState);
  query.append('platforms[][type]', 'shopify');
  query.append('platforms[][seller_id]', merchant.shopDomain);
  query.append('platforms[][sales][90_days]', String(merchant.trailing90DaySales));

  const response = await fetch(
    `https://app.onrampfunds.com/partners/api/embed/prequalifications?${query}`,
    {
      headers: { authorization: `Bearer ${await onrampAccessToken()}` },
      // The response is served Cache-Control: no-store, and that is a mandate, not a hint: the
      // body holds a merchant-specific amount with no expiry field, and each call is counted as
      // an impression, so a cached response shows a stale figure and drops renders from
      // reporting.
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    // A 422 is an integration error, never a decline — a merchant who does not qualify gets a
    // 200 with a null amount. Either way, render the page without the card rather than failing
    // it. A merchant's dashboard should not break because a financing panel is unavailable.
    throw new Error(`prequalification failed: ${response.status}`);
  }

  // amount, currency, applyUrl, lexicon, copy and theme all come back from here, in camelCase.
  // Forward the whole thing — do not pick fields out of it. A 200 can still carry
  // `amount: null`, which the card handles by rendering nothing.
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
