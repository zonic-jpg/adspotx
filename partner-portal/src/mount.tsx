import { createRoot, type Root } from "react-dom/client";
import PartnerPortalApp from "./App";
export { IntegrateAdSpotButton } from "./components/IntegrateAdSpotButton";

let root: Root | null = null;

export interface MountPartnerPortalOptions {
  container: HTMLElement;
}

/** Mount partner portal into any host app (e.g. AdSpot at /partners). */
export function mountPartnerPortal({ container }: MountPartnerPortalOptions): () => void {
  root = createRoot(container);
  root.render(<PartnerPortalApp />);
  return () => {
    root?.unmount();
    root = null;
  };
}

export { PartnerPortalApp };
