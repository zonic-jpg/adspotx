export default function RevenuePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Revenue</h2>
        <p className="text-slate-600 mt-1">
          Rev-share statements appear here after AdSpot integration is active and campaigns complete verification.
        </p>
      </div>
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-slate-500">No revenue data yet — connect AdSpot to start earning.</p>
      </div>
    </div>
  );
}
