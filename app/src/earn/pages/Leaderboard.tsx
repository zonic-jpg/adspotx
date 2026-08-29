import { DashboardLayout } from "@earn/components/layout/DashboardLayout";
import { useGetLeaderboard } from "@workspace/api-client-react";
import { Trophy } from "lucide-react";

export default function Leaderboard() {
  const { data: leaderboard, isLoading } = useGetLeaderboard();

  return (
    <DashboardLayout title="Leaderboard">
      <div className="space-y-6 max-w-2xl">

        <div className="gradient-bg px-6 py-5 flex items-center gap-3">
          <Trophy size={20} className="text-[#f9ca24]" />
          <div>
            <h2 className="text-[15px] font-black text-white uppercase tracking-wider">Weekly Top Reviewers</h2>
            <p className="text-white/50 text-[12px] font-medium mt-0.5">This week's most active AdSpot reviewers</p>
          </div>
        </div>

        <div className="border border-black/[0.07] divide-y divide-black/[0.05] bg-white">
          {isLoading ? (
            <div className="px-6 py-16 text-center text-[14px] text-[#9ca3af] font-medium">Loading…</div>
          ) : leaderboard?.entries && leaderboard.entries.length > 0 ? (
            leaderboard.entries.map(entry => (
              <div key={entry.userId}
                className={`flex items-center justify-between px-6 py-4 ${entry.isCurrentUser ? "bg-[#f97316]/[0.06] border-l-4 border-l-[#f97316]" : ""}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 flex items-center justify-center text-[13px] font-black ${
                    entry.rank === 1 ? "bg-[#f9ca24] text-[#0f0f14]" :
                    entry.rank === 2 ? "bg-[#C0C0C0] text-white" :
                    entry.rank === 3 ? "bg-[#CD7F32] text-white" :
                    "bg-[#f0f0f0] text-[#9ca3af]"
                  }`}>
                    {entry.rank}
                  </div>
                  <div>
                    <p className={`text-[14px] font-bold ${entry.isCurrentUser ? "text-[#f97316]" : "text-[#0f0f14]"}`}>
                      {entry.isCurrentUser ? `${entry.username} (You)` : entry.username}
                    </p>
                    {entry.rank <= 3 && (
                      <p className="text-[11px] text-[#9ca3af] font-medium">
                        {entry.rank === 1 ? "🥇 Gold" : entry.rank === 2 ? "🥈 Silver" : "🥉 Bronze"}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-black text-[#0f0f14] tabular-nums">
                    {entry.pointsTotal.toLocaleString()} pts
                  </p>
                  <p className="text-[11px] text-[#9ca3af] font-medium">this week</p>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-16 text-center text-[14px] text-[#9ca3af] font-medium">
              No activity this week. Start reviewing ads to appear here!
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
