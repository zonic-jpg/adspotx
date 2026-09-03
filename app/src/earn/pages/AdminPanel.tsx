import { useState } from "react";
import { DashboardLayout } from "@earn/components/layout/DashboardLayout";
import {
  useGetAdminUsers, useGetAdminAds, useGetAdminEvents,
  useGetSettings, useGetAdminPackages,
  useCreatePackage, useUpdatePackage, useDeletePackage, useUpdateSettings,
  customFetch,
} from "@workspace/api-client-react";
import type { AdPackage, PlatformSetting } from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@earn/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@earn/components/ui/table";
import { Input } from "@earn/components/ui/input";
import { useToast } from "@earn/hooks/use-toast";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@earn/contexts/AuthContext";
import {
  Shield, Users, Video, Activity, Package, Settings,
  Plus, Trash2, Pencil, Save, X, Check, Crown, UserPlus,
  ChevronDown, Loader2, BarChart3, MessageSquare, Building2,
  Coins, CreditCard, Monitor, ChevronRight, AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { HealthIndicator } from "@earn/components/admin/HealthPanel";

// ─── Types ────────────────────────────────────────────────────────────────────
type AppRole = "reviewer" | "brand" | "admin" | "super_admin";
type AdStatus = "draft" | "active" | "paused" | "archived";
type QuestionType = "multiple_choice" | "rating" | "open_text" | "emoji" | "yes_no";
type RedemptionStatus = "pending" | "processing" | "completed" | "failed";
type SessionStatus = "in_progress" | "completed" | "abandoned";

interface TeamMember { id: string; email: string; username: string; role: AppRole; createdAt: string }
interface AdminStats {
  totalUsers: number; totalReviewers: number; totalBrands: number; totalAdmins: number;
  totalAds: number; activeAds: number; totalCompletions: number; totalPointsIssued: number;
  pendingRedemptions: number; completedRedemptions: number;
}
interface AdminAd {
  id: string; title: string; status: AdStatus; brandId: string; brandName: string | null;
  assetUrl: string; assetType: string; description: string | null;
  minWatchSeconds: number; pointReward: number; multiplierFactor: string;
  createdAt: string; totalViews: number; completedViews: number; questionCount: number;
}
interface Question {
  id: string; adId: string; questionType: QuestionType; questionText: string;
  sortOrder: number; options: string[] | null; createdAt: string;
}
interface Brand {
  id: string; companyName: string; website: string | null; logoUrl: string | null;
  userId: string; userEmail: string | null; username: string | null;
  adCount: number; createdAt: string;
}
interface PointsEntry {
  id: string; amount: number; source: string; description: string | null;
  createdAt: string; userId: string; userEmail: string | null; username: string | null;
}
interface Redemption {
  id: string; amountPoints: number; redemptionType: string; status: RedemptionStatus;
  notes: string | null; createdAt: string; updatedAt: string;
  userId: string; userEmail: string | null; username: string | null;
}
interface ReviewSession {
  id: string; startedAt: string; completedAt: string | null;
  watchSeconds: number | null; pointsAwarded: number | null; status: SessionStatus;
  userId: string; adId: string; userEmail: string | null; username: string | null; adTitle: string | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useAdminStats() {
  return useQuery<AdminStats>({ queryKey: ["admin-stats"], queryFn: () => customFetch<AdminStats>("/api/admin/stats"), staleTime: 30_000 });
}
function useTeam() {
  return useQuery<{ team: TeamMember[]; total: number }>({ queryKey: ["admin-team"], queryFn: () => customFetch("/api/admin/team"), staleTime: 20_000 });
}
function useAdminBrands(params: { limit?: number; offset?: number } = {}) {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 100), offset: String(params.offset ?? 0) });
  return useQuery<{ brands: Brand[]; total: number }>({ queryKey: ["admin-brands", params], queryFn: () => customFetch(`/api/admin/brands?${qs}`) });
}
function useAdminPoints(params: { limit?: number; offset?: number; userId?: string } = {}) {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 50), offset: String(params.offset ?? 0) });
  if (params.userId) qs.set("userId", params.userId);
  return useQuery<{ entries: PointsEntry[]; total: number }>({ queryKey: ["admin-points", params], queryFn: () => customFetch(`/api/admin/points?${qs}`) });
}
function useAdminRedemptions(params: { limit?: number; offset?: number; status?: string } = {}) {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 100), offset: String(params.offset ?? 0) });
  if (params.status) qs.set("status", params.status);
  return useQuery<{ redemptions: Redemption[]; total: number }>({ queryKey: ["admin-redemptions", params], queryFn: () => customFetch(`/api/admin/redemptions?${qs}`) });
}
function useAdminSessions(params: { limit?: number; offset?: number; status?: string } = {}) {
  const qs = new URLSearchParams({ limit: String(params.limit ?? 100), offset: String(params.offset ?? 0) });
  if (params.status) qs.set("status", params.status);
  return useQuery<{ sessions: ReviewSession[]; total: number }>({ queryKey: ["admin-sessions", params], queryFn: () => customFetch(`/api/admin/sessions?${qs}`) });
}
function useAdQuestions(adId: string | null) {
  return useQuery<{ questions: Question[]; total: number }>({
    queryKey: ["admin-ad-questions", adId],
    queryFn: () => customFetch(`/api/admin/ads/${adId}/questions`),
    enabled: !!adId,
  });
}
function useCreateAdminUser() {
  return useMutation<TeamMember, Error, { email: string; username: string; password: string; role: AppRole }>({
    mutationFn: (data) => customFetch("/api/admin/users", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  });
}
function useChangeRole() {
  return useMutation<{ id: string; role: AppRole }, Error, { userId: string; role: AppRole }>({
    mutationFn: ({ userId, role }) => customFetch(`/api/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }), headers: { "Content-Type": "application/json" } }),
  });
}
function useDeleteUser() {
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (userId) => customFetch(`/api/admin/users/${userId}`, { method: "DELETE" }),
  });
}
function usePatchAdStatus() {
  return useMutation<void, Error, { adId: string; status: string }>({
    mutationFn: ({ adId, status }) => customFetch(`/api/admin/ads/${adId}/status`, { method: "PATCH", body: JSON.stringify({ status }), headers: { "Content-Type": "application/json" } }),
  });
}
function useEditAd() {
  return useMutation<AdminAd, Error, { adId: string; data: Partial<AdminAd> }>({
    mutationFn: ({ adId, data }) => customFetch(`/api/admin/ads/${adId}`, { method: "PUT", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  });
}
function useDeleteAd() {
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (adId) => customFetch(`/api/admin/ads/${adId}`, { method: "DELETE" }),
  });
}
function useAddQuestion() {
  return useMutation<Question, Error, { adId: string; data: Partial<Question> }>({
    mutationFn: ({ adId, data }) => customFetch(`/api/admin/ads/${adId}/questions`, { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  });
}
function useEditQuestion() {
  return useMutation<Question, Error, { questionId: string; data: Partial<Question> }>({
    mutationFn: ({ questionId, data }) => customFetch(`/api/admin/questions/${questionId}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  });
}
function useDeleteQuestion() {
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (questionId) => customFetch(`/api/admin/questions/${questionId}`, { method: "DELETE" }),
  });
}
function useEditBrand() {
  return useMutation<Brand, Error, { brandId: string; data: Partial<Brand> }>({
    mutationFn: ({ brandId, data }) => customFetch(`/api/admin/brands/${brandId}`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  });
}
function useAdjustPoints() {
  return useMutation<PointsEntry, Error, { userId: string; amount: number; description: string }>({
    mutationFn: (data) => customFetch("/api/admin/points/adjust", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  });
}
function useUpdateRedemptionStatus() {
  return useMutation<Redemption, Error, { id: string; status: RedemptionStatus; notes?: string }>({
    mutationFn: ({ id, ...data }) => customFetch(`/api/admin/redemptions/${id}/status`, { method: "PATCH", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }),
  });
}
function useDeleteSession() {
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (id) => customFetch(`/api/admin/sessions/${id}`, { method: "DELETE" }),
  });
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
const ROLE_STYLE: Record<AppRole, string> = {
  super_admin: "bg-[#7950f2]/15 text-[#7950f2] border border-[#7950f2]/30",
  admin:       "bg-[#ff6b00]/15 text-[#ff6b00] border border-[#ff6b00]/30",
  brand:       "bg-[#0071e3]/15 text-[#0071e3] border border-[#0071e3]/30",
  reviewer:    "bg-[#f3f4f6] text-[#6b7280] border border-black/[0.07]",
};
const ROLE_LABEL: Record<AppRole, string> = { super_admin: "Super Admin", admin: "Admin", brand: "Brand", reviewer: "Reviewer" };

function RoleBadge({ role }: { role: AppRole }) {
  return (
    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 ${ROLE_STYLE[role] ?? ROLE_STYLE.reviewer}`}>
      {role === "super_admin" && <Crown size={9} className="inline mr-1" />}
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active:     "bg-[#f97316]/15 text-[#c2410c]",
  draft:      "bg-[#f3f4f6] text-[#9ca3af]",
  paused:     "bg-amber-100 text-amber-700",
  archived:   "bg-red-100/60 text-red-500",
  pending:    "bg-amber-100 text-amber-700",
  processing: "bg-[#0071e3]/10 text-[#0071e3]",
  completed:  "bg-[#f97316]/15 text-[#c2410c]",
  failed:     "bg-red-100/60 text-red-500",
  in_progress:"bg-[#0071e3]/10 text-[#0071e3]",
  abandoned:  "bg-[#f3f4f6] text-[#9ca3af]",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 ${STATUS_COLORS[status] ?? STATUS_COLORS.draft}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function StatCard({ label, value, sub, color = "#e91e8c", icon: Icon }: { label: string; value: string | number; sub?: string; color?: string; icon: any }) {
  return (
    <div className="bg-white border border-black/[0.07] p-5">
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#6b7280]">{label}</span>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="text-[28px] font-black tracking-[-0.03em] text-[#0f0f14] leading-none">{value}</div>
      {sub && <p className="text-[11px] text-[#9ca3af] mt-1">{sub}</p>}
    </div>
  );
}

function ActionBtn({ onClick, title, children, danger }: { onClick: () => void; title?: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} title={title}
      className={`w-7 h-7 flex items-center justify-center border border-black/[0.1] transition-colors ${danger ? "hover:bg-red-50 hover:text-red-600 text-[#9ca3af]" : "hover:bg-[#f3f4f6] text-[#6b7280]"}`}>
      {children}
    </button>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab() {
  const { data: stats, isLoading } = useAdminStats();
  const { data: eventsData, isLoading: loadingEvents } = useGetAdminEvents({ limit: 15 });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-black/[0.07]">
        <StatCard icon={Users} label="Total Users" value={isLoading ? "…" : (stats?.totalUsers ?? 0).toLocaleString()} sub={`${stats?.totalReviewers ?? 0} reviewers · ${stats?.totalBrands ?? 0} brands`} color="#e91e8c" />
        <StatCard icon={Video} label="Total Ads" value={isLoading ? "…" : (stats?.totalAds ?? 0).toLocaleString()} sub={`${stats?.activeAds ?? 0} active`} color="#0071e3" />
        <StatCard icon={BarChart3} label="Completions" value={isLoading ? "…" : (stats?.totalCompletions ?? 0).toLocaleString()} sub="Finished reviews" color="#f97316" />
        <StatCard icon={Coins} label="Points Issued" value={isLoading ? "…" : (stats?.totalPointsIssued ?? 0).toLocaleString()} sub="Total across all reviewers" color="#ff6b00" />
      </div>
      <div className="grid grid-cols-2 gap-px bg-black/[0.07]">
        <StatCard icon={CreditCard} label="Pending Redemptions" value={isLoading ? "…" : (stats?.pendingRedemptions ?? 0)} sub="Awaiting action" color="#ff6b00" />
        <StatCard icon={Crown} label="Completed Redemptions" value={isLoading ? "…" : (stats?.completedRedemptions ?? 0)} sub="All time" color="#f97316" />
      </div>

      <div className="bg-white border border-black/[0.07]">
        <div className="px-6 py-4 border-b border-black/[0.07]">
          <h3 className="text-[14px] font-black text-[#0f0f14]">Recent Audit Log</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#fafafa]">
                <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Time</TableHead>
                <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Event</TableHead>
                <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingEvents ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-[#9ca3af]"><Loader2 size={16} className="animate-spin mx-auto" /></TableCell></TableRow>
              ) : eventsData?.events.map(event => (
                <TableRow key={event.id} className="hover:bg-[#fafafa]">
                  <TableCell className="text-[11px] font-mono text-[#9ca3af]">{new Date(event.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="text-[12px] font-semibold text-[#0f0f14] font-mono">{event.eventType}</TableCell>
                  <TableCell className="text-[11px] font-mono text-[#6b7280]">{event.actorId?.slice(0, 8) || "system"}…</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ─── Team tab ─────────────────────────────────────────────────────────────────
function TeamTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useTeam();
  const createMutation = useCreateAdminUser();
  const changeMutation = useChangeRole();
  const deleteMutation = useDeleteUser();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", username: "", password: "", role: "admin" as AppRole });
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("admin");
  const isSuperAdmin = user?.role === "super_admin";

  const handleCreate = () => {
    if (!form.email || !form.username || !form.password) { toast({ variant: "destructive", title: "All fields required" }); return; }
    createMutation.mutate(form, {
      onSuccess: () => { toast({ title: "User created" }); setShowForm(false); setForm({ email: "", username: "", password: "", role: "admin" }); refetch(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  const handleRoleChange = (memberId: string) => {
    changeMutation.mutate({ userId: memberId, role: newRole }, {
      onSuccess: () => { toast({ title: "Role updated" }); setChangingRole(null); refetch(); qc.invalidateQueries({ queryKey: ["/admin/users"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  const handleDelete = (memberId: string, email: string) => {
    if (!confirm(`Delete ${email}? This cannot be undone.`)) return;
    deleteMutation.mutate(memberId, {
      onSuccess: () => { toast({ title: "User deleted" }); refetch(); qc.invalidateQueries({ queryKey: ["/admin/users"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-black text-[#0f0f14]">Admin Team</h3>
          <p className="text-[12px] text-[#9ca3af] mt-0.5">All admin and super admin accounts.</p>
        </div>
        {isSuperAdmin && (
          <button onClick={() => setShowForm(v => !v)} className="btn btn-green gap-2 text-[13px]">
            <UserPlus size={13} /> Add Member
          </button>
        )}
      </div>

      {showForm && isSuperAdmin && (
        <div className="bg-[#f9fafb] border border-black/[0.1] p-6 space-y-4">
          <h4 className="text-[13px] font-black text-[#0f0f14]">Create New Account</h4>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { label: "Email", key: "email", ph: "name@adspot.demo" },
              { label: "Username", key: "username", ph: "username" },
              { label: "Password", key: "password", ph: "Min. 8 characters", type: "password" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[11px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1.5">{f.label}</label>
                <Input type={f.type || "text"} value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.ph} className="h-10 text-[13px]" />
              </div>
            ))}
            <div>
              <label className="text-[11px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1.5">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppRole }))}
                className="w-full h-10 border border-black/[0.12] text-[13px] font-medium bg-white px-3 outline-none focus:border-[#e91e8c]">
                <option value="reviewer">Reviewer</option>
                <option value="brand">Brand</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleCreate} disabled={createMutation.isPending} className="btn btn-green text-[13px] gap-2 disabled:opacity-60">
              {createMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Create Account
            </button>
            <button onClick={() => setShowForm(false)} className="text-[13px] text-[#9ca3af] hover:text-[#0f0f14] px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-black/[0.07]">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#fafafa]">
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Member</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Role</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Joined</TableHead>
              {isSuperAdmin && <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 size={16} className="animate-spin mx-auto text-[#e91e8c]" /></TableCell></TableRow>
            ) : data?.team.map(member => (
              <TableRow key={member.id} className="hover:bg-[#fafafa]">
                <TableCell>
                  <p className="text-[13px] font-bold text-[#0f0f14]">{member.username}</p>
                  <p className="text-[11px] text-[#9ca3af]">{member.email}</p>
                </TableCell>
                <TableCell>
                  {changingRole === member.id ? (
                    <div className="flex items-center gap-2">
                      <select defaultValue={member.role} onChange={e => setNewRole(e.target.value as AppRole)}
                        className="h-8 border border-black/[0.12] text-[12px] px-2 bg-white outline-none">
                        {(["reviewer","brand","admin","super_admin"] as AppRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <button onClick={() => handleRoleChange(member.id)} disabled={changeMutation.isPending}
                        className="w-7 h-7 flex items-center justify-center bg-[#f97316] text-white disabled:opacity-50">
                        {changeMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      </button>
                      <button onClick={() => setChangingRole(null)} className="w-7 h-7 flex items-center justify-center border border-black/[0.1] hover:bg-[#f3f4f6]"><X size={11} /></button>
                    </div>
                  ) : <RoleBadge role={member.role} />}
                </TableCell>
                <TableCell className="text-[12px] text-[#9ca3af]">
                  {new Date(member.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                </TableCell>
                {isSuperAdmin && (
                  <TableCell className="text-right">
                    {member.id !== user?.id && member.role !== "super_admin" ? (
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn onClick={() => { setChangingRole(member.id); setNewRole(member.role); }} title="Change role"><ChevronDown size={12} /></ActionBtn>
                        <ActionBtn onClick={() => handleDelete(member.id, member.email)} title="Delete" danger><Trash2 size={11} /></ActionBtn>
                      </div>
                    ) : member.id === user?.id ? (
                      <span className="text-[11px] text-[#9ca3af] italic">You</span>
                    ) : (
                      <span className="text-[11px] text-[#7950f2] font-bold">Protected</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [roleFilter, setRoleFilter] = useState<string>("");
  const { data: usersData, isLoading } = useGetAdminUsers({ limit: 100, role: roleFilter as any || undefined });
  const changeMutation = useChangeRole();
  const deleteMutation = useDeleteUser();
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("reviewer");
  const isSuperAdmin = me?.role === "super_admin";

  const handleRoleChange = (userId: string) => {
    changeMutation.mutate({ userId, role: newRole }, {
      onSuccess: () => { toast({ title: "Role updated" }); setChangingRole(null); qc.invalidateQueries({ queryKey: ["/admin/users"] }); qc.invalidateQueries({ queryKey: ["admin-team"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  const handleDelete = (userId: string, email: string) => {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    deleteMutation.mutate(userId, {
      onSuccess: () => { toast({ title: "User deleted" }); qc.invalidateQueries({ queryKey: ["/admin/users"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="h-9 border border-black/[0.12] text-[12px] font-medium px-3 bg-white outline-none focus:border-[#e91e8c]">
          <option value="">All Roles</option>
          {(["super_admin","admin","brand","reviewer"] as AppRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <span className="text-[12px] text-[#9ca3af]">{usersData?.total ?? 0} users</span>
      </div>

      <div className="bg-white border border-black/[0.07]">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#fafafa]">
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">User</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Role</TableHead>
              <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Points</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Joined</TableHead>
              {isSuperAdmin && <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 size={18} className="animate-spin mx-auto text-[#e91e8c]" /></TableCell></TableRow>
            ) : usersData?.users.map((u) => (
              <TableRow key={u.id} className="hover:bg-[#fafafa]">
                <TableCell>
                  <p className="text-[13px] font-bold text-[#0f0f14]">{u.username}</p>
                  <p className="text-[11px] text-[#9ca3af]">{u.email}</p>
                </TableCell>
                <TableCell>
                  {changingRole === u.id ? (
                    <div className="flex items-center gap-2">
                      <select defaultValue={u.role} onChange={e => setNewRole(e.target.value as AppRole)}
                        className="h-8 border border-black/[0.12] text-[12px] px-2 bg-white outline-none">
                        {(["reviewer","brand","admin","super_admin"] as AppRole[]).map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                      <button onClick={() => handleRoleChange(u.id)} disabled={changeMutation.isPending}
                        className="w-7 h-7 flex items-center justify-center bg-[#f97316] text-white disabled:opacity-50"><Check size={11} /></button>
                      <button onClick={() => setChangingRole(null)} className="w-7 h-7 flex items-center justify-center border border-black/[0.1] hover:bg-[#f3f4f6]"><X size={11} /></button>
                    </div>
                  ) : <RoleBadge role={u.role as AppRole} />}
                </TableCell>
                <TableCell className="text-right font-mono text-[12px] text-[#374151]">
                  {u.pointsBalance != null ? u.pointsBalance.toLocaleString() : "—"}
                </TableCell>
                <TableCell className="text-[11px] text-[#9ca3af]">
                  {new Date(u.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                </TableCell>
                {isSuperAdmin && (
                  <TableCell className="text-right">
                    {u.id !== me?.id && u.role !== "super_admin" ? (
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn onClick={() => { setChangingRole(u.id); setNewRole(u.role as AppRole); }} title="Change role"><ChevronDown size={12} /></ActionBtn>
                        <ActionBtn onClick={() => handleDelete(u.id, u.email)} danger title="Delete user"><Trash2 size={11} /></ActionBtn>
                      </div>
                    ) : u.id === me?.id ? (
                      <span className="text-[11px] text-[#9ca3af] italic">You</span>
                    ) : (
                      <span className="text-[11px] text-[#7950f2] font-bold">Protected</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Question manager panel ────────────────────────────────────────────────────
function QuestionPanel({ adId, adTitle, onClose }: { adId: string; adTitle: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useAdQuestions(adId);
  const addMutation = useAddQuestion();
  const editMutation = useEditQuestion();
  const deleteMutation = useDeleteQuestion();

  const [showNew, setShowNew] = useState(false);
  const [newQ, setNewQ] = useState({ questionType: "yes_no" as QuestionType, questionText: "", sortOrder: "0", options: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState({ questionText: "", options: "" });

  const handleAdd = () => {
    if (!newQ.questionText.trim()) { toast({ variant: "destructive", title: "Question text required" }); return; }
    const opts = newQ.options ? newQ.options.split("\n").map(s => s.trim()).filter(Boolean) : undefined;
    addMutation.mutate({ adId, data: { questionType: newQ.questionType, questionText: newQ.questionText, sortOrder: parseInt(newQ.sortOrder) || 0, options: opts?.length ? opts : undefined } as any }, {
      onSuccess: () => { toast({ title: "Question added" }); setShowNew(false); setNewQ({ questionType: "yes_no", questionText: "", sortOrder: "0", options: "" }); refetch(); qc.invalidateQueries({ queryKey: ["/admin/ads"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  const handleEdit = (q: Question) => {
    editMutation.mutate({ questionId: q.id, data: { questionText: editQ.questionText, options: editQ.options ? editQ.options.split("\n").map(s => s.trim()).filter(Boolean) : null } as any }, {
      onSuccess: () => { toast({ title: "Question updated" }); setEditingId(null); refetch(); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  const handleDelete = (qId: string) => {
    if (!confirm("Delete this question?")) return;
    deleteMutation.mutate(qId, {
      onSuccess: () => { toast({ title: "Question deleted" }); refetch(); qc.invalidateQueries({ queryKey: ["/admin/ads"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  return (
    <div className="border-t-2 border-[#e91e8c] bg-[#fafafa] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[14px] font-black text-[#0f0f14]">Questions</h4>
          <p className="text-[11px] text-[#9ca3af]">{adTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNew(v => !v)} className="btn btn-green gap-1.5 text-[12px]"><Plus size={12} /> Add Question</button>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center border border-black/[0.1] hover:bg-[#f3f4f6] text-[#9ca3af]"><X size={13} /></button>
        </div>
      </div>

      {showNew && (
        <div className="bg-white border border-black/[0.1] p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Type</label>
              <select value={newQ.questionType} onChange={e => setNewQ(q => ({ ...q, questionType: e.target.value as QuestionType }))}
                className="w-full h-9 border border-black/[0.12] text-[12px] px-2 bg-white outline-none focus:border-[#e91e8c]">
                {(["yes_no","rating","multiple_choice","open_text","emoji"] as QuestionType[]).map(t => <option key={t} value={t}>{t.replace("_"," ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Sort Order</label>
              <Input value={newQ.sortOrder} onChange={e => setNewQ(q => ({ ...q, sortOrder: e.target.value }))} type="number" className="h-9 text-[12px]" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Question Text</label>
            <Input value={newQ.questionText} onChange={e => setNewQ(q => ({ ...q, questionText: e.target.value }))} placeholder="e.g. Would you buy this product?" className="h-9 text-[12px]" />
          </div>
          {newQ.questionType === "multiple_choice" && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Options (one per line)</label>
              <textarea value={newQ.options} onChange={e => setNewQ(q => ({ ...q, options: e.target.value }))}
                className="w-full border border-black/[0.12] text-[12px] p-2 outline-none focus:border-[#e91e8c] h-20 resize-none" placeholder="Option A&#10;Option B&#10;Option C" />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={addMutation.isPending} className="btn btn-green text-[12px] gap-1.5 disabled:opacity-60">
              {addMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
            </button>
            <button onClick={() => setShowNew(false)} className="text-[12px] text-[#9ca3af] hover:text-[#0f0f14] px-3 py-2">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-4 text-center"><Loader2 size={16} className="animate-spin mx-auto text-[#e91e8c]" /></div>
      ) : data?.questions.length === 0 ? (
        <p className="text-[12px] text-[#9ca3af] py-4 text-center">No questions yet. Add one above.</p>
      ) : (
        <div className="space-y-2">
          {data?.questions.map(q => (
            <div key={q.id} className="bg-white border border-black/[0.07] px-4 py-3">
              {editingId === q.id ? (
                <div className="space-y-2">
                  <Input value={editQ.questionText} onChange={e => setEditQ(v => ({ ...v, questionText: e.target.value }))} className="h-8 text-[12px]" />
                  {q.questionType === "multiple_choice" && (
                    <textarea value={editQ.options} onChange={e => setEditQ(v => ({ ...v, options: e.target.value }))}
                      className="w-full border border-black/[0.12] text-[12px] p-2 outline-none focus:border-[#e91e8c] h-16 resize-none" />
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(q)} disabled={editMutation.isPending}
                      className="btn btn-green text-[11px] gap-1 disabled:opacity-60"><Save size={10} /> Save</button>
                    <button onClick={() => setEditingId(null)} className="text-[11px] text-[#9ca3af] px-2 py-1">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#9ca3af] mr-2">{q.questionType.replace("_"," ")}</span>
                    <span className="text-[13px] font-medium text-[#0f0f14]">{q.questionText}</span>
                    {q.options && <p className="text-[11px] text-[#9ca3af] mt-0.5">{q.options.join(" · ")}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <ActionBtn onClick={() => { setEditingId(q.id); setEditQ({ questionText: q.questionText, options: q.options?.join("\n") ?? "" }); }} title="Edit"><Pencil size={11} /></ActionBtn>
                    <ActionBtn onClick={() => handleDelete(q.id)} danger title="Delete"><Trash2 size={11} /></ActionBtn>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Ads tab ──────────────────────────────────────────────────────────────────
function AdsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: adsData, isLoading, refetch } = useGetAdminAds({ limit: 100, status: statusFilter as any || undefined });
  const patchStatus = usePatchAdStatus();
  const editAdMutation = useEditAd();
  const deleteAdMutation = useDeleteAd();

  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AdminAd>>({});
  const [questionsAdId, setQuestionsAdId] = useState<string | null>(null);
  const [questionsAdTitle, setQuestionsAdTitle] = useState("");

  const startEdit = (ad: AdminAd) => {
    setQuestionsAdId(null);
    setEditingAdId(ad.id);
    setEditForm({
      title: ad.title, description: ad.description ?? "",
      assetUrl: ad.assetUrl, assetType: ad.assetType as any,
      minWatchSeconds: ad.minWatchSeconds, pointReward: ad.pointReward,
      multiplierFactor: ad.multiplierFactor, status: ad.status,
    });
  };

  const saveEdit = () => {
    if (!editingAdId) return;
    const payload: any = { ...editForm };
    if (payload.multiplierFactor !== undefined) payload.multiplierFactor = parseFloat(String(payload.multiplierFactor));
    editAdMutation.mutate({ adId: editingAdId, data: payload }, {
      onSuccess: () => { toast({ title: "Ad updated" }); setEditingAdId(null); refetch(); qc.invalidateQueries({ queryKey: ["/admin/ads"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  const handleDelete = (adId: string, title: string) => {
    if (!confirm(`Delete "${title}"? This will also delete all its questions and sessions. This cannot be undone.`)) return;
    deleteAdMutation.mutate(adId, {
      onSuccess: () => { toast({ title: "Ad deleted" }); refetch(); qc.invalidateQueries({ queryKey: ["/admin/ads"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  const toggleQuestions = (ad: AdminAd) => {
    setEditingAdId(null);
    if (questionsAdId === ad.id) { setQuestionsAdId(null); } else { setQuestionsAdId(ad.id); setQuestionsAdTitle(ad.title); }
  };

  return (
    <div className="space-y-0 border border-black/[0.07]">
      <div className="flex items-center justify-between p-4 border-b border-black/[0.07] bg-white">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-9 border border-black/[0.12] text-[12px] font-medium px-3 bg-white outline-none focus:border-[#e91e8c]">
          <option value="">All Statuses</option>
          {["draft","active","paused","archived"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-[12px] text-[#9ca3af]">{adsData?.total ?? 0} ads</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-[#fafafa]">
            <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Ad</TableHead>
            <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Brand</TableHead>
            <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Status</TableHead>
            <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Views</TableHead>
            <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Pts</TableHead>
            <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 size={18} className="animate-spin mx-auto text-[#e91e8c]" /></TableCell></TableRow>
          ) : (adsData?.ads as AdminAd[] | undefined)?.map(ad => (
            <>
              <TableRow key={ad.id} className={`hover:bg-[#fafafa] ${editingAdId === ad.id || questionsAdId === ad.id ? "bg-[#fdf0f6]" : ""}`}>
                <TableCell className="max-w-[180px]">
                  <p className="text-[13px] font-bold text-[#0f0f14] truncate">{ad.title}</p>
                  <p className="text-[10px] text-[#9ca3af]">{ad.assetType} · {ad.minWatchSeconds}s watch</p>
                </TableCell>
                <TableCell className="text-[12px] text-[#6b7280]">{ad.brandName ?? "—"}</TableCell>
                <TableCell>
                  <select value={ad.status}
                    onChange={e => patchStatus.mutate({ adId: ad.id, status: e.target.value }, {
                      onSuccess: () => { toast({ title: "Status updated" }); refetch(); },
                      onError: () => toast({ variant: "destructive", title: "Failed" }),
                    })}
                    className="h-7 border border-black/[0.1] text-[11px] px-2 bg-white outline-none focus:border-[#e91e8c]">
                    {["draft","active","paused","archived"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </TableCell>
                <TableCell className="text-right font-mono text-[11px] text-[#9ca3af]">{ad.completedViews}/{ad.totalViews}</TableCell>
                <TableCell className="text-right font-mono text-[12px] text-[#374151]">{ad.pointReward}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ActionBtn onClick={() => editingAdId === ad.id ? setEditingAdId(null) : startEdit(ad)} title="Edit ad">
                      <Pencil size={11} />
                    </ActionBtn>
                    <ActionBtn onClick={() => toggleQuestions(ad)} title={`${ad.questionCount} question(s)`}>
                      <div className="relative">
                        <MessageSquare size={11} />
                        {ad.questionCount > 0 && <span className="absolute -top-1.5 -right-1.5 text-[8px] font-black bg-[#e91e8c] text-white rounded-full w-3 h-3 flex items-center justify-center leading-none">{ad.questionCount}</span>}
                      </div>
                    </ActionBtn>
                    <ActionBtn onClick={() => handleDelete(ad.id, ad.title)} danger title="Delete ad"><Trash2 size={11} /></ActionBtn>
                  </div>
                </TableCell>
              </TableRow>

              {editingAdId === ad.id && (
                <TableRow key={`${ad.id}-edit`}>
                  <TableCell colSpan={6} className="p-0">
                    <div className="border-t-2 border-[#0071e3] bg-[#f0f6ff] p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-[13px] font-black text-[#0f0f14]">Edit Ad</h4>
                        <button onClick={() => setEditingAdId(null)} className="text-[#9ca3af] hover:text-[#0f0f14]"><X size={14} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Title", key: "title" },
                          { label: "Asset URL", key: "assetUrl" },
                        ].map(f => (
                          <div key={f.key}>
                            <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">{f.label}</label>
                            <Input value={String((editForm as any)[f.key] ?? "")} onChange={e => setEditForm(v => ({ ...v, [f.key]: e.target.value }))} className="h-9 text-[12px] bg-white" />
                          </div>
                        ))}
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Asset Type</label>
                          <select value={editForm.assetType || "image"} onChange={e => setEditForm(v => ({ ...v, assetType: e.target.value as any }))}
                            className="w-full h-9 border border-black/[0.12] text-[12px] px-2 bg-white outline-none focus:border-[#e91e8c]">
                            <option value="image">Image</option>
                            <option value="video">Video</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Status</label>
                          <select value={editForm.status || "draft"} onChange={e => setEditForm(v => ({ ...v, status: e.target.value as AdStatus }))}
                            className="w-full h-9 border border-black/[0.12] text-[12px] px-2 bg-white outline-none focus:border-[#e91e8c]">
                            {["draft","active","paused","archived"].map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Min Watch (sec)</label>
                          <Input type="number" value={editForm.minWatchSeconds ?? ""} onChange={e => setEditForm(v => ({ ...v, minWatchSeconds: parseInt(e.target.value) || 0 }))} className="h-9 text-[12px] bg-white" />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Point Reward</label>
                          <Input type="number" value={editForm.pointReward ?? ""} onChange={e => setEditForm(v => ({ ...v, pointReward: parseInt(e.target.value) || 0 }))} className="h-9 text-[12px] bg-white" />
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Multiplier</label>
                          <Input type="number" step="0.1" value={editForm.multiplierFactor ?? ""} onChange={e => setEditForm(v => ({ ...v, multiplierFactor: e.target.value }))} className="h-9 text-[12px] bg-white" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Description</label>
                          <Input value={editForm.description ?? ""} onChange={e => setEditForm(v => ({ ...v, description: e.target.value }))} className="h-9 text-[12px] bg-white" />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-4">
                        <button onClick={saveEdit} disabled={editAdMutation.isPending} className="btn btn-green text-[12px] gap-1.5 disabled:opacity-60">
                          {editAdMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Changes
                        </button>
                        <button onClick={() => setEditingAdId(null)} className="text-[12px] text-[#9ca3af] hover:text-[#0f0f14] px-4 py-2">Cancel</button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {questionsAdId === ad.id && (
                <TableRow key={`${ad.id}-questions`}>
                  <TableCell colSpan={6} className="p-0">
                    <QuestionPanel adId={ad.id} adTitle={ad.title} onClose={() => setQuestionsAdId(null)} />
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Brands tab ───────────────────────────────────────────────────────────────
function BrandsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useAdminBrands({ limit: 100 });
  const editMutation = useEditBrand();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ companyName: "", website: "", logoUrl: "" });

  const startEdit = (b: Brand) => {
    setEditingId(b.id);
    setEditForm({ companyName: b.companyName, website: b.website ?? "", logoUrl: b.logoUrl ?? "" });
  };

  const saveEdit = () => {
    if (!editingId) return;
    editMutation.mutate({ brandId: editingId, data: { companyName: editForm.companyName, website: editForm.website || null, logoUrl: editForm.logoUrl || null } as any }, {
      onSuccess: () => { toast({ title: "Brand updated" }); setEditingId(null); refetch(); qc.invalidateQueries({ queryKey: ["/admin/ads"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-black text-[#0f0f14]">Brands</h3>
          <p className="text-[12px] text-[#9ca3af]">Edit brand company names, websites and logos.</p>
        </div>
        <span className="text-[12px] text-[#9ca3af]">{data?.total ?? 0} brands</span>
      </div>

      <div className="bg-white border border-black/[0.07]">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#fafafa]">
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Brand</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Owner</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Website</TableHead>
              <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Ads</TableHead>
              <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 size={18} className="animate-spin mx-auto text-[#e91e8c]" /></TableCell></TableRow>
            ) : data?.brands.map(b => (
              <>
                <TableRow key={b.id} className={`hover:bg-[#fafafa] ${editingId === b.id ? "bg-[#f0f6ff]" : ""}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {b.logoUrl ? (
                        <img src={b.logoUrl} alt="" className="w-7 h-7 object-contain border border-black/[0.07]" />
                      ) : (
                        <div className="w-7 h-7 bg-[#f3f4f6] flex items-center justify-center text-[#9ca3af]"><Building2 size={12} /></div>
                      )}
                      <span className="text-[13px] font-bold text-[#0f0f14]">{b.companyName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-[12px] text-[#374151]">{b.username}</p>
                    <p className="text-[10px] text-[#9ca3af]">{b.userEmail}</p>
                  </TableCell>
                  <TableCell className="text-[12px] text-[#9ca3af]">
                    {b.website ? <a href={b.website} target="_blank" rel="noreferrer" className="text-[#0071e3] hover:underline truncate block max-w-[140px]">{b.website}</a> : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12px]">{b.adCount}</TableCell>
                  <TableCell className="text-right">
                    <ActionBtn onClick={() => editingId === b.id ? setEditingId(null) : startEdit(b)} title="Edit brand"><Pencil size={11} /></ActionBtn>
                  </TableCell>
                </TableRow>

                {editingId === b.id && (
                  <TableRow key={`${b.id}-edit`}>
                    <TableCell colSpan={5} className="p-0">
                      <div className="border-t-2 border-[#0071e3] bg-[#f0f6ff] p-5">
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          {[
                            { label: "Company Name", key: "companyName" },
                            { label: "Website URL", key: "website", ph: "https://example.com" },
                            { label: "Logo URL", key: "logoUrl", ph: "https://example.com/logo.png" },
                          ].map(f => (
                            <div key={f.key}>
                              <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">{f.label}</label>
                              <Input value={(editForm as any)[f.key]} onChange={e => setEditForm(v => ({ ...v, [f.key]: e.target.value }))} placeholder={f.ph} className="h-8 text-[12px] bg-white" />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={editMutation.isPending} className="btn btn-green text-[12px] gap-1 disabled:opacity-60">
                            {editMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-[12px] text-[#9ca3af] px-3 py-2">Cancel</button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Points tab ───────────────────────────────────────────────────────────────
function PointsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: usersData } = useGetAdminUsers({ limit: 200, role: "reviewer" });
  const [selectedUserId, setSelectedUserId] = useState("");
  const { data, isLoading, refetch } = useAdminPoints({ limit: 100, userId: selectedUserId || undefined });
  const adjustMutation = useAdjustPoints();

  const [adjForm, setAdjForm] = useState({ userId: "", amount: "", description: "" });

  const handleAdjust = () => {
    const amt = parseInt(adjForm.amount);
    if (!adjForm.userId) { toast({ variant: "destructive", title: "Select a user" }); return; }
    if (!amt || amt === 0) { toast({ variant: "destructive", title: "Enter a non-zero amount" }); return; }
    if (!adjForm.description.trim()) { toast({ variant: "destructive", title: "Description required" }); return; }
    adjustMutation.mutate({ userId: adjForm.userId, amount: amt, description: adjForm.description }, {
      onSuccess: () => { toast({ title: amt > 0 ? `+${amt} points awarded` : `${amt} points deducted` }); setAdjForm({ userId: "", amount: "", description: "" }); refetch(); qc.invalidateQueries({ queryKey: ["/admin/users"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  const SOURCE_COLOR: Record<string, string> = {
    review: "text-[#c2410c]", share_bonus: "text-[#0071e3]", multiplier: "text-[#7950f2]",
    admin_grant: "text-[#ff6b00]", redemption: "text-red-500",
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#fdf8ec] border border-[#ff6b00]/20 p-6">
        <h3 className="text-[14px] font-black text-[#0f0f14] mb-4">Manual Point Adjustment</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Reviewer</label>
            <select value={adjForm.userId} onChange={e => setAdjForm(f => ({ ...f, userId: e.target.value }))}
              className="w-full h-9 border border-black/[0.12] text-[12px] px-2 bg-white outline-none focus:border-[#e91e8c]">
              <option value="">Select reviewer…</option>
              {usersData?.users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.email})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Amount (use − to deduct)</label>
            <Input type="number" value={adjForm.amount} onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 100 or -50" className="h-9 text-[12px]" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Reason</label>
            <Input value={adjForm.description} onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))} placeholder="Bonus for feedback survey" className="h-9 text-[12px]" />
          </div>
        </div>
        <button onClick={handleAdjust} disabled={adjustMutation.isPending} className="btn btn-green text-[13px] gap-2 disabled:opacity-60">
          {adjustMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Coins size={13} />} Apply Adjustment
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-black text-[#0f0f14]">Points Ledger</h3>
          <div className="flex items-center gap-2">
            <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
              className="h-8 border border-black/[0.12] text-[11px] px-2 bg-white outline-none focus:border-[#e91e8c]">
              <option value="">All reviewers</option>
              {usersData?.users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
            <button onClick={() => refetch()} className="w-8 h-8 flex items-center justify-center border border-black/[0.1] hover:bg-[#f3f4f6] text-[#6b7280]"><RefreshCw size={12} /></button>
          </div>
        </div>

        <div className="bg-white border border-black/[0.07]">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#fafafa]">
                <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Reviewer</TableHead>
                <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Source</TableHead>
                <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Amount</TableHead>
                <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Description</TableHead>
                <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 size={18} className="animate-spin mx-auto text-[#e91e8c]" /></TableCell></TableRow>
              ) : data?.entries.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-[12px] text-[#9ca3af]">No points records yet.</TableCell></TableRow>
              ) : data?.entries.map(e => (
                <TableRow key={e.id} className="hover:bg-[#fafafa]">
                  <TableCell>
                    <p className="text-[12px] font-bold text-[#0f0f14]">{e.username ?? "—"}</p>
                    <p className="text-[10px] text-[#9ca3af]">{e.userEmail}</p>
                  </TableCell>
                  <TableCell>
                    <span className={`text-[10px] font-black uppercase tracking-wider ${SOURCE_COLOR[e.source] ?? "text-[#9ca3af]"}`}>{e.source.replace("_"," ")}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] font-bold" style={{ color: e.amount > 0 ? "#c2410c" : "#dc2626" }}>
                    {e.amount > 0 ? "+" : ""}{e.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-[12px] text-[#6b7280] max-w-[200px] truncate">{e.description ?? "—"}</TableCell>
                  <TableCell className="text-[11px] text-[#9ca3af] whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ─── Redemptions tab ──────────────────────────────────────────────────────────
function RedemptionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, isLoading, refetch } = useAdminRedemptions({ limit: 100, status: statusFilter || undefined });
  const updateMutation = useUpdateRedemptionStatus();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState("");

  const handleStatusChange = (r: Redemption, newStatus: RedemptionStatus) => {
    updateMutation.mutate({ id: r.id, status: newStatus, notes: noteInput || undefined }, {
      onSuccess: () => { toast({ title: `Redemption marked ${newStatus}` }); setUpdatingId(null); setNoteInput(""); refetch(); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  const TYPE_LABEL: Record<string, string> = { airtime: "Airtime", cash: "Cash", voucher: "Voucher" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-black text-[#0f0f14]">Redemptions</h3>
          <p className="text-[12px] text-[#9ca3af]">Approve, process, or reject reviewer withdrawal requests.</p>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-9 border border-black/[0.12] text-[12px] font-medium px-3 bg-white outline-none focus:border-[#e91e8c]">
          <option value="">All Statuses</option>
          {["pending","processing","completed","failed"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-white border border-black/[0.07]">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#fafafa]">
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Reviewer</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Type</TableHead>
              <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Points</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Status</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Requested</TableHead>
              <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 size={18} className="animate-spin mx-auto text-[#e91e8c]" /></TableCell></TableRow>
            ) : data?.redemptions.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-[12px] text-[#9ca3af]">No redemptions found.</TableCell></TableRow>
            ) : data?.redemptions.map(r => (
              <>
                <TableRow key={r.id} className={`hover:bg-[#fafafa] ${updatingId === r.id ? "bg-[#fdf0f6]" : ""}`}>
                  <TableCell>
                    <p className="text-[13px] font-bold text-[#0f0f14]">{r.username ?? "—"}</p>
                    <p className="text-[10px] text-[#9ca3af]">{r.userEmail}</p>
                  </TableCell>
                  <TableCell className="text-[12px] font-medium text-[#374151]">{TYPE_LABEL[r.redemptionType] ?? r.redemptionType}</TableCell>
                  <TableCell className="text-right font-mono text-[13px] font-black text-[#0f0f14]">{r.amountPoints.toLocaleString()}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-[11px] text-[#9ca3af]">
                    {new Date(r.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-right">
                    <button onClick={() => updatingId === r.id ? setUpdatingId(null) : (setUpdatingId(r.id), setNoteInput(r.notes ?? ""))}
                      className="text-[11px] font-bold text-[#0071e3] hover:underline flex items-center gap-1 ml-auto">
                      <ChevronRight size={11} className={`transition-transform ${updatingId === r.id ? "rotate-90" : ""}`} /> Manage
                    </button>
                  </TableCell>
                </TableRow>

                {updatingId === r.id && (
                  <TableRow key={`${r.id}-manage`}>
                    <TableCell colSpan={6} className="p-0">
                      <div className="border-t-2 border-[#e91e8c] bg-[#fdf0f6] px-6 py-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">Internal Note (optional)</label>
                            <Input value={noteInput} onChange={e => setNoteInput(e.target.value)} placeholder="e.g. Processed via bank transfer" className="h-8 text-[12px] bg-white max-w-xs" />
                          </div>
                          <div className="flex items-center gap-2 pt-5">
                            {r.status === "pending" && (
                              <button onClick={() => handleStatusChange(r, "processing")} disabled={updateMutation.isPending}
                                className="px-3 py-1.5 text-[11px] font-black bg-[#0071e3] text-white hover:bg-[#0062c4] transition-colors disabled:opacity-50">
                                Mark Processing
                              </button>
                            )}
                            {(r.status === "pending" || r.status === "processing") && (
                              <button onClick={() => handleStatusChange(r, "completed")} disabled={updateMutation.isPending}
                                className="px-3 py-1.5 text-[11px] font-black bg-[#f97316] text-white hover:bg-[#ea6c0a] transition-colors disabled:opacity-50">
                                Mark Completed
                              </button>
                            )}
                            {r.status !== "failed" && r.status !== "completed" && (
                              <button onClick={() => handleStatusChange(r, "failed")} disabled={updateMutation.isPending}
                                className="px-3 py-1.5 text-[11px] font-black border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50">
                                Mark Failed
                              </button>
                            )}
                            {r.notes && <p className="text-[10px] text-[#9ca3af]">Note: {r.notes}</p>}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Sessions tab ─────────────────────────────────────────────────────────────
function SessionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, isLoading, refetch } = useAdminSessions({ limit: 100, status: statusFilter || undefined });
  const deleteMutation = useDeleteSession();

  const handleDelete = (id: string, username: string | null, adTitle: string | null) => {
    if (!confirm(`Invalidate session by ${username ?? "user"} on "${adTitle ?? "ad"}"?\n\nThis deletes the session and revokes any points awarded. Cannot be undone.`)) return;
    deleteMutation.mutate(id, {
      onSuccess: () => { toast({ title: "Session invalidated", description: "Points have been reversed." }); refetch(); qc.invalidateQueries({ queryKey: ["admin-stats"] }); },
      onError: (e: any) => toast({ variant: "destructive", title: "Failed", description: e.message }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-black text-[#0f0f14]">Review Sessions</h3>
          <p className="text-[12px] text-[#9ca3af]">View all review activity. Invalidate suspicious sessions to revoke points.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="h-9 border border-black/[0.12] text-[12px] font-medium px-3 bg-white outline-none focus:border-[#e91e8c]">
            <option value="">All Statuses</option>
            {["in_progress","completed","abandoned"].map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
          </select>
          <button onClick={() => refetch()} className="w-9 h-9 flex items-center justify-center border border-black/[0.1] hover:bg-[#f3f4f6] text-[#6b7280]"><RefreshCw size={13} /></button>
        </div>
      </div>

      <div className="bg-white border border-black/[0.07]">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#fafafa]">
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Reviewer</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Ad</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Status</TableHead>
              <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Watch</TableHead>
              <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Points</TableHead>
              <TableHead className="text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Started</TableHead>
              <TableHead className="text-right text-[11px] font-black uppercase tracking-wider text-[#9ca3af]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 size={18} className="animate-spin mx-auto text-[#e91e8c]" /></TableCell></TableRow>
            ) : data?.sessions.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-[12px] text-[#9ca3af]">No sessions found.</TableCell></TableRow>
            ) : data?.sessions.map(s => (
              <TableRow key={s.id} className="hover:bg-[#fafafa]">
                <TableCell>
                  <p className="text-[12px] font-bold text-[#0f0f14]">{s.username ?? "—"}</p>
                  <p className="text-[10px] text-[#9ca3af]">{s.userEmail}</p>
                </TableCell>
                <TableCell className="text-[12px] text-[#374151] max-w-[160px] truncate">{s.adTitle ?? "—"}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
                <TableCell className="text-right font-mono text-[11px] text-[#9ca3af]">
                  {s.watchSeconds != null ? `${s.watchSeconds}s` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-[12px]" style={{ color: s.pointsAwarded ? "#c2410c" : undefined }}>
                  {s.pointsAwarded != null ? `+${s.pointsAwarded}` : "—"}
                </TableCell>
                <TableCell className="text-[11px] text-[#9ca3af] whitespace-nowrap">
                  {new Date(s.startedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })} {new Date(s.startedAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                </TableCell>
                <TableCell className="text-right">
                  <ActionBtn onClick={() => handleDelete(s.id, s.username, s.adTitle)} danger title="Invalidate session">
                    <AlertTriangle size={11} />
                  </ActionBtn>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Packages tab ─────────────────────────────────────────────────────────────
function PackagesTab({ packages, isLoading, onRefresh }: { packages: AdPackage[]; isLoading: boolean; onRefresh: () => void }) {
  const { toast } = useToast();
  const createMutation = useCreatePackage();
  const updateMutation = useUpdatePackage();
  const deleteMutation = useDeletePackage();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<AdPackage>>({});
  const [showNew, setShowNew] = useState(false);
  const [newPkg, setNewPkg] = useState({ name: "", price: "", adSlots: "1", durationDays: "30", maxImpressions: "10000" });

  const saveEdit = (pkgId: string) => {
    updateMutation.mutate(
      { packageId: pkgId, data: { ...editValues, price: typeof editValues.price === "string" ? parseFloat(editValues.price) : editValues.price } as any },
      { onSuccess: () => { setEditingId(null); onRefresh(); toast({ title: "Package updated" }); }, onError: () => toast({ variant: "destructive", title: "Update failed" }) }
    );
  };

  const deletePackage = (pkgId: string) => {
    if (!confirm("Delete this package?")) return;
    deleteMutation.mutate({ packageId: pkgId }, { onSuccess: () => { onRefresh(); toast({ title: "Package deleted" }); }, onError: () => toast({ variant: "destructive", title: "Delete failed" }) });
  };

  const createPackage = () => {
    createMutation.mutate(
      { data: { name: newPkg.name, price: parseFloat(newPkg.price), adSlots: parseInt(newPkg.adSlots), durationDays: parseInt(newPkg.durationDays), maxImpressions: parseInt(newPkg.maxImpressions) } },
      { onSuccess: () => { setShowNew(false); setNewPkg({ name: "", price: "", adSlots: "1", durationDays: "30", maxImpressions: "10000" }); onRefresh(); toast({ title: "Package created" }); }, onError: () => toast({ variant: "destructive", title: "Create failed" }) }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-black text-[#0f0f14]">Pricing Packages</h3>
        <button onClick={() => setShowNew(true)} className="btn btn-green gap-2 text-[13px]"><Plus size={13} /> New Package</button>
      </div>

      {showNew && (
        <div className="bg-[#f9fafb] border border-black/[0.1] p-5 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { label: "Name", key: "name", ph: "Starter Pack" },
              { label: "Price (USD)", key: "price", ph: "99.00", type: "number" },
              { label: "Ad Slots", key: "adSlots", ph: "1", type: "number" },
              { label: "Duration (days)", key: "durationDays", ph: "30", type: "number" },
              { label: "Max Impressions", key: "maxImpressions", ph: "10000", type: "number" },
            ].map(f => (
              <div key={f.key}>
                <label className="text-[11px] font-black uppercase tracking-wider text-[#0f0f14]/50 block mb-1">{f.label}</label>
                <Input value={(newPkg as any)[f.key]} onChange={e => setNewPkg(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} type={f.type} className="h-9 text-[13px]" />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={createPackage} disabled={createMutation.isPending} className="btn btn-green text-[13px] gap-1.5 disabled:opacity-60"><Check size={12} /> Create</button>
            <button onClick={() => setShowNew(false)} className="text-[13px] text-[#9ca3af] hover:text-[#0f0f14] px-4 py-2">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-8"><Loader2 size={18} className="animate-spin mx-auto text-[#e91e8c]" /></div>
      ) : (
        <div className="space-y-2">
          {packages.map(pkg => (
            <div key={pkg.id} className={`bg-white border ${pkg.featured ? "border-[#e91e8c]/30" : "border-black/[0.07]"} p-4`}>
              {editingId === pkg.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Name", key: "name", value: editValues.name ?? pkg.name },
                      { label: "Price", key: "price", value: editValues.price ?? pkg.price, type: "number" },
                      { label: "Ad Slots", key: "adSlots", value: editValues.adSlots ?? pkg.adSlots, type: "number" },
                      { label: "Duration (days)", key: "durationDays", value: editValues.durationDays ?? pkg.durationDays, type: "number" },
                    ].map(f => (
                      <div key={f.key}>
                        <label className="text-[10px] uppercase tracking-wider text-[#9ca3af] block mb-1">{f.label}</label>
                        <Input value={String(f.value)} onChange={e => setEditValues(v => ({ ...v, [f.key]: f.type === "number" ? parseFloat(e.target.value) || 0 : e.target.value }))} type={f.type} className="h-8 text-[12px]" />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(pkg.id)} disabled={updateMutation.isPending} className="btn btn-green text-[12px] gap-1 disabled:opacity-60"><Save size={11} /> Save</button>
                    <button onClick={() => setEditingId(null)} className="text-[12px] text-[#9ca3af] px-3 py-2 hover:text-[#0f0f14]">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[14px] font-black text-[#0f0f14]">{pkg.name}</span>
                      {pkg.featured && <span className="text-[10px] px-1.5 py-0.5 bg-[#e91e8c]/10 text-[#e91e8c] font-bold uppercase tracking-wider">Featured</span>}
                      {!pkg.active && <span className="text-[10px] px-1.5 py-0.5 bg-[#f3f4f6] text-[#9ca3af] font-bold uppercase tracking-wider">Inactive</span>}
                    </div>
                    <div className="flex gap-4 text-[12px] text-[#9ca3af]">
                      <span className="font-black text-[#0f0f14]">
                        ₦{Number(pkg.price ?? 0).toLocaleString()}
                      </span>
                      <span>{pkg.adSlots} slot{pkg.adSlots !== 1 ? "s" : ""}</span>
                      <span>{pkg.durationDays}d</span>
                      <span>{(pkg.maxImpressions ?? (pkg as { impressions?: number }).impressions ?? 0).toLocaleString()} impressions</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <ActionBtn onClick={() => { setEditingId(pkg.id); setEditValues({}); }} title="Edit"><Pencil size={12} /></ActionBtn>
                    <ActionBtn onClick={() => deletePackage(pkg.id)} danger title="Delete"><Trash2 size={12} /></ActionBtn>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings tab ─────────────────────────────────────────────────────────────
function SettingsTab({ settings, isLoading, onRefresh }: { settings: PlatformSetting[]; isLoading: boolean; onRefresh: () => void }) {
  const { toast } = useToast();
  const updateMutation = useUpdateSettings();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const saveSetting = (key: string, value: string, label: string) => {
    setUpdatingKey(key);
    updateMutation.mutate({ data: { updates: [{ key, value }] } }, {
      onSuccess: () => {
        setEditingKey(null);
        setUpdatingKey(null);
        onRefresh();
        toast({ title: "Setting updated", description: `${label} → ${value}` });
      },
      onError: () => {
        setUpdatingKey(null);
        toast({ variant: "destructive", title: "Update failed" });
      },
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between pb-4 mb-2">
        <div>
          <h3 className="text-[16px] font-black text-[#0f0f14]">Platform Settings</h3>
          <p className="text-[12px] text-[#9ca3af] mt-0.5">Changes take effect immediately across all services.</p>
        </div>
      </div>
      <div className="bg-white border border-black/[0.07]">
        {isLoading ? (
          <div className="text-center py-10"><Loader2 size={18} className="animate-spin mx-auto text-[#e91e8c]" /></div>
        ) : settings.length === 0 ? (
          <div className="text-center py-12 text-[13px] text-[#9ca3af]">
            No settings found. Run <code className="font-mono text-[11px] bg-[#f3f4f6] px-1.5 py-0.5">pnpm --filter @workspace/db seed:settings</code> to initialise defaults.
          </div>
        ) : (
          <div className="divide-y divide-black/[0.06]">
            {settings.map(setting => {
              const isUpdating = updatingKey === setting.key;
              const isOn = setting.value === "true";
              return (
                <div key={setting.key} className="px-6 py-4 flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-[#0f0f14]">{setting.label || setting.key}</span>
                      {setting.key === "demo_mode" && isOn && (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 border border-amber-200">
                          Demo Active
                        </span>
                      )}
                      {setting.key === "demo_mode" && !isOn && (
                        <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 px-1.5 py-0.5 border border-emerald-200">
                          Production
                        </span>
                      )}
                    </div>
                    {setting.description && (
                      <p className="text-[11px] text-[#9ca3af] mt-0.5 leading-relaxed max-w-lg">{setting.description}</p>
                    )}
                    <p className="font-mono text-[10px] text-[#d1d5db] mt-0.5">{setting.key}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pt-0.5">
                    {setting.type === "boolean" ? (
                      // Instant toggle — no save step needed for booleans
                      <button
                        onClick={() => saveSetting(setting.key, isOn ? "false" : "true", setting.label)}
                        disabled={isUpdating}
                        title={isOn ? "Click to disable" : "Click to enable"}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] disabled:opacity-50 ${
                          isOn ? "bg-[#f97316]" : "bg-[#d1d5db]"
                        }`}
                      >
                        {isUpdating ? (
                          <Loader2 size={10} className="absolute left-1/2 -translate-x-1/2 animate-spin text-white" />
                        ) : (
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                            isOn ? "translate-x-6" : "translate-x-1"
                          }`} />
                        )}
                      </button>
                    ) : editingKey === setting.key ? (
                      <>
                        <Input
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="w-36 h-8 text-[12px]"
                          type={setting.type === "number" ? "number" : "text"}
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === "Enter") saveSetting(setting.key, editValue, setting.label);
                            if (e.key === "Escape") setEditingKey(null);
                          }}
                        />
                        <button
                          onClick={() => saveSetting(setting.key, editValue, setting.label)}
                          disabled={isUpdating}
                          className="w-8 h-8 flex items-center justify-center bg-[#f97316] text-white disabled:opacity-50"
                        >
                          {isUpdating ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button onClick={() => setEditingKey(null)} className="w-8 h-8 flex items-center justify-center border border-black/[0.1] hover:bg-[#f3f4f6]">
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-[12px] px-3 py-1 bg-[#f3f4f6] text-[#374151]">
                          {setting.value}
                        </span>
                        <button
                          onClick={() => { setEditingKey(setting.key); setEditValue(setting.value); }}
                          className="w-8 h-8 flex items-center justify-center border border-black/[0.1] hover:bg-[#f3f4f6] text-[#6b7280]"
                        >
                          <Pencil size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: packagesData, isLoading: loadingPackages } = useGetAdminPackages();
  const { data: settingsData, isLoading: loadingSettings } = useGetSettings();
  const isSuperAdmin = user?.role === "super_admin";

  const tabs = [
    { value: "overview",     label: "Overview",     icon: Activity },
    { value: "team",         label: isSuperAdmin ? "Team ★" : "Team", icon: Shield },
    { value: "users",        label: "Users",        icon: Users },
    { value: "ads",          label: "Ads",          icon: Video },
    { value: "brands",       label: "Brands",       icon: Building2 },
    { value: "points",       label: "Points",       icon: Coins },
    { value: "redemptions",  label: "Redemptions",  icon: CreditCard },
    { value: "sessions",     label: "Sessions",     icon: Monitor },
    { value: "packages",     label: "Packages",     icon: Package },
    { value: "settings",     label: "Settings",     icon: Settings },
  ];

  return (
    <DashboardLayout title="Admin Panel">
      <div className="space-y-0 border border-black/[0.07]">

        <div className="bg-white px-8 py-6 border-b border-black/[0.07] flex items-center justify-between">
          <div>
            <h2 className="text-[24px] font-black tracking-[-0.03em] text-[#0f0f14]">Admin Control Panel</h2>
            <p className="text-[12px] text-[#9ca3af] font-medium mt-0.5">
              Logged in as <strong className="text-[#0f0f14]">{user?.username}</strong>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <HealthIndicator />
            <RoleBadge role={(user?.role ?? "admin") as AppRole} />
          </div>
        </div>

        <Tabs defaultValue="overview" className="bg-white">
          <div className="border-b border-black/[0.07] px-4 overflow-x-auto">
            <TabsList className="h-auto p-0 bg-transparent gap-0 rounded-none flex w-max min-w-full">
              {tabs.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#e91e8c] data-[state=active]:text-[#e91e8c] data-[state=active]:bg-transparent text-[11px] font-bold px-3 py-4 text-[#6b7280] transition-all gap-1.5 whitespace-nowrap shrink-0">
                  <tab.icon size={12} />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview"    className="p-8 mt-0"><OverviewTab /></TabsContent>
          <TabsContent value="team"        className="p-8 mt-0"><TeamTab /></TabsContent>
          <TabsContent value="users"       className="p-8 mt-0"><UsersTab /></TabsContent>
          <TabsContent value="ads"         className="p-6 mt-0"><AdsTab /></TabsContent>
          <TabsContent value="brands"      className="p-8 mt-0"><BrandsTab /></TabsContent>
          <TabsContent value="points"      className="p-8 mt-0"><PointsTab /></TabsContent>
          <TabsContent value="redemptions" className="p-8 mt-0"><RedemptionsTab /></TabsContent>
          <TabsContent value="sessions"    className="p-8 mt-0"><SessionsTab /></TabsContent>
          <TabsContent value="packages"    className="p-8 mt-0">
            <PackagesTab
              packages={packagesData?.packages ?? []}
              isLoading={loadingPackages}
              onRefresh={() => qc.invalidateQueries({ queryKey: ["/admin/packages"] })}
            />
          </TabsContent>
          <TabsContent value="settings"    className="p-8 mt-0">
            <SettingsTab
              settings={settingsData?.settings ?? []}
              isLoading={loadingSettings}
              onRefresh={() => qc.invalidateQueries({ queryKey: ["/admin/settings"] })}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
