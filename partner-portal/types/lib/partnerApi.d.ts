export declare function fetchPartner(partnerId: string): Promise<{
    partner: import("./types").PartnerProfile;
}>;
export declare function fetchIntegration(partnerId: string): Promise<import("./types").PartnerIntegration>;
export declare function activateIntegrationApi(partnerId: string): Promise<import("./types").PartnerIntegration>;
export declare function deactivateIntegrationApi(partnerId: string): Promise<import("./types").PartnerIntegration>;
export declare function createPartner(body: {
    name: string;
    outletType?: string;
    website?: string;
    contactEmail?: string;
    region?: string;
}): Promise<{
    partner: import("./types").PartnerProfile;
}>;
//# sourceMappingURL=partnerApi.d.ts.map