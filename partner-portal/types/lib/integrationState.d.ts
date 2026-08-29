import type { PartnerIntegration } from "./types";
/** Default inactive snapshot — never claim active without API confirmation. */
export declare function defaultIntegration(partnerId: string): PartnerIntegration;
export declare function readIntegrationCache(partnerId: string): PartnerIntegration | null;
export declare function cacheIntegration(partnerId: string, integration: PartnerIntegration): void;
export declare function clearIntegrationCache(partnerId: string): void;
export declare function mergeWithCache(partnerId: string, remote: PartnerIntegration | null): PartnerIntegration;
//# sourceMappingURL=integrationState.d.ts.map