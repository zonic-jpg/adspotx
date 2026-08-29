export default function PartnersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Network partners</h2>
        <p className="text-slate-600 mt-1">
          Newspapers and media outlets in the AdSpot Network Partner Program. Onboarding is separate from live AdSpot routing.
        </p>
      </div>
      <ul className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        <li className="px-4 py-4 flex justify-between gap-4">
          <div>
            <p className="font-medium">Audit Daily (demo)</p>
            <p className="text-sm text-slate-500">Newspaper · Lagos</p>
          </div>
          <span className="text-xs font-medium text-slate-500 self-center">Pilot</span>
        </li>
      </ul>
    </div>
  );
}
