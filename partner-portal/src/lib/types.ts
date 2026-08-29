export type IntegrationStatus = "inactive" | "active";

export interface PartnerProfile {
  id: string;
  name: string;
  outletType: string;
  website?: string | null;
  contactEmail?: string | null;
  region?: string | null;
}

export interface PartnerIntegration {
  status: IntegrationStatus;
  adspotLinked: boolean;
  partnerId: string;
  apiKey?: string;
  webhookUrl?: string;
  embedScript?: string;
  embedConfig?: {
    scriptTag?: string;
    partnerId?: string;
    baseUrl?: string;
  };
  activatedAt?: string | null;
  deactivatedAt?: string | null;
  message?: string;
}

export interface PartnerApiError {
  error: string;
  message: string;
  details?: unknown;
}
