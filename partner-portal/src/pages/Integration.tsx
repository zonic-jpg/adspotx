import { IntegrateAdSpotButton } from "../components/IntegrateAdSpotButton";

const DEMO_PARTNER_ID =
  (import.meta.env.VITE_PARTNER_ID as string | undefined) ??
  "00000000-0000-4000-8000-000000000001";

export default function IntegrationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">AdSpot integration</h2>
        <p className="text-slate-600 mt-1">
          Opt in when you are ready. Default state is <strong>inactive</strong> — no campaigns route to AdSpot until you activate.
        </p>
      </div>
      <IntegrateAdSpotButton partnerId={DEMO_PARTNER_ID} />
    </div>
  );
}
