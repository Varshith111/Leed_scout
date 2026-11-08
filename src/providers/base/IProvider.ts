import type { ProviderName } from '../../models/enums';

/** Raw business data extracted by a provider before any verification. */
export interface BusinessData {
  readonly providerBusinessId?: string | undefined;
  readonly name: string;
  readonly category?: string | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly website?: string | undefined;
  readonly address?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly country?: string | undefined;
  readonly rating?: number | undefined;
  readonly reviewCount?: number | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly googleMapsUrl?: string | undefined;
  readonly rawData?: Record<string, unknown> | undefined;
}

export interface SearchParams {
  readonly category: string;
  readonly city: string;
  readonly state?: string | undefined;
  readonly country?: string | undefined;
  /** Hard ceiling on results collected. */
  readonly limit: number;
}

export interface IProvider {
  readonly name: ProviderName;
  /**
   * Searches for businesses matching `params` and yields them one at a time.
   * The caller is responsible for stopping iteration once `limit` is reached.
   */
  search(params: SearchParams): AsyncGenerator<BusinessData>;
  /** Releases browser resources. Safe to call when never initialised. */
  close(): Promise<void>;
}
