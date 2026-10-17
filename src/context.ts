import type { FinnaClient } from "./finna/client.js";
import type { HoldingsClient } from "./holdings/client.js";

export interface ServerContext {
  finna: FinnaClient;
  holdings: HoldingsClient;
  /** Finna building code for the search scope, e.g. "0/Helmet/". */
  org: string;
  /** Human-readable scope label used in responses. */
  scopeLabel: string;
  availabilityEnabled: boolean;
}
