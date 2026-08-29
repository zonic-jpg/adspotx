const SLOTS = [
  { id: "home-hero", name: "Homepage hero", size: "970×250", status: "available" },
  { id: "article-inline", name: "Article inline", size: "300×250", status: "available" },
  { id: "sidebar-sticky", name: "Sidebar sticky", size: "300×600", status: "reserved" },
];

export default function SlotsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Inventory slots</h2>
        <p className="text-slate-600 mt-1">Define where review campaigns can appear on your properties.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Slot</th>
              <th className="px-4 py-3 font-medium">Size</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium">{slot.name}</td>
                <td className="px-4 py-3 text-slate-600">{slot.size}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize">
                    {slot.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
