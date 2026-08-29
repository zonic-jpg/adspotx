import type { PartnerIntegration } from "./types";
export declare function getIntegrationStatus(partnerId: string): Promise<PartnerIntegration>;
export declare function activateIntegration(partnerId: string): Promise<PartnerIntegration>;
export declare function deactivateIntegration(partnerId: string): Promise<PartnerIntegration>;
export declare function getEmbedTag(partnerId: string): string | null;
export declare function clearLocalIntegration(partnerId: string): void;
//# sourceMappingURL=adspotBridge.d.ts.map