import { IntegrateAdSpotButton } from "../components/IntegrateAdSpotButton";

const DEMO_PARTNER_ID =
  (import.meta.env.VITE_PARTNER_ID as string | undefined) ??
  "00000000-0000-4000-8000-000000000001";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
        <p className="text-slate-600 mt-1">
          Manage your media outlet profile, inventory slots, and revenue — independently of AdSpot until you connect.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active slots", value: "12", hint: "Editorial + sidebar" },
          { label: "Pending campaigns", value: "0", hint: "Connect AdSpot to receive" },
          { label: "Est. monthly rev-share", value: "—", hint: "Available after integration" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="text-3xl font-bold mt-1">{card.value}</p>
            <p className="text-xs text-slate-400 mt-2">{card.hint}</p>
          </div>
        ))}
      </div>

      <IntegrateAdSpotButton partnerId={DEMO_PARTNER_ID} />
    </div>
  );
}
