import PartnerPortalApp from "./App";
export { IntegrateAdSpotButton } from "./components/IntegrateAdSpotButton";
export interface MountPartnerPortalOptions {
    container: HTMLElement;
}
/** Mount partner portal into any host app (e.g. AdSpot at /partners). */
export declare function mountPartnerPortal({ container }: MountPartnerPortalOptions): () => void;
export { PartnerPortalApp };
//# sourceMappingURL=mount.d.ts.map