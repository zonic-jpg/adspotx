/**
 * In-memory admin console data when AUDIT_PARTNER_MOCK=1 (hostile audit Tier 2, no DB).
 * Mirrors seeded demo accounts so Users / Events / Financials render with real rows.
 */
import { partnerMemoryEnabled } from "./partner-memory-store";

export const MOCK_ADMIN_USER_ID = "00000000-0000-4000-8000-000000000099";
export const MOCK_REVIEWER_ID = "00000000-0000-4000-8000-000000000002";
export const MOCK_BRAND_USER_ID = "00000000-0000-4000-8000-000000000003";
export const MOCK_BRAND_ID = "00000000-0000-4000-8000-000000000004";
export const MOCK_SUPER_ADMIN_ID = "00000000-0000-4000-8000-000000000005";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

export const MOCK_DEMO_PASSWORD = "password123";

const MOCK_USERS = [
  {
    id: MOCK_SUPER_ADMIN_ID,
    email: "oadeagbo@gmail.com",
    username: "platform-owner",
    role: "super_admin" as const,
    createdAt: daysAgo(120),
    pointsBalance: null,
  },
  {
    id: MOCK_ADMIN_USER_ID,
    email: "admin@adspot.demo",
    username: "audit-admin",
    role: "admin" as const,
    createdAt: daysAgo(90),
    pointsBalance: null,
  },
  {
    id: MOCK_REVIEWER_ID,
    email: "alice@reviewer.demo",
    username: "alice",
    role: "reviewer" as const,
    createdAt: daysAgo(60),
    pointsBalance: 2840,
  },
  {
    id: MOCK_BRAND_USER_ID,
    email: "brand@adspot.demo",
    username: "demo-brand",
    role: "brand" as const,
    createdAt: daysAgo(45),
    pointsBalance: null,
  },
];

const MOCK_EVENTS = [
  {
    id: "00000000-0000-4000-8000-000000000e01",
    eventType: "user.login",
    actorId: MOCK_ADMIN_USER_ID,
    entityType: "user",
    entityId: MOCK_ADMIN_USER_ID,
    metadata: { portal: "brands" },
    createdAt: daysAgo(0),
  },
  {
    id: "00000000-0000-4000-8000-000000000e02",
    eventType: "ad_created",
    actorId: MOCK_BRAND_USER_ID,
    entityType: "ad",
    entityId: "00000000-0000-4000-8000-000000000a01",
    metadata: { title: "Summer Splash Campaign" },
    createdAt: daysAgo(2),
  },
  {
    id: "00000000-0000-4000-8000-000000000e03",
    eventType: "review.completed",
    actorId: MOCK_REVIEWER_ID,
    entityType: "review_session",
    entityId: "00000000-0000-4000-8000-000000000b01",
    metadata: { pointsAwarded: 120 },
    createdAt: daysAgo(3),
  },
  {
    id: "00000000-0000-4000-8000-000000000e04",
    eventType: "admin.users_queried",
    actorId: MOCK_ADMIN_USER_ID,
    entityType: "admin",
    entityId: null,
    metadata: { total: MOCK_USERS.length },
    createdAt: daysAgo(5),
  },
  {
    id: "00000000-0000-4000-8000-000000000e05",
    eventType: "redemption.requested",
    actorId: MOCK_REVIEWER_ID,
    entityType: "redemption",
    entityId: "00000000-0000-4000-8000-000000000r01",
    metadata: { amountPoints: 500 },
    createdAt: daysAgo(7),
  },
];

const MOCK_POINTS = [
  {
    id: "00000000-0000-4000-8000-000000000p01",
    amount: 120,
    source: "review_completion",
    description: "Summer Splash Campaign",
    createdAt: daysAgo(3),
    userId: MOCK_REVIEWER_ID,
    userEmail: "alice@reviewer.demo",
    username: "alice",
  },
  {
    id: "00000000-0000-4000-8000-000000000p02",
    amount: 80,
    source: "review_completion",
    description: "Brand awareness video",
    createdAt: daysAgo(10),
    userId: MOCK_REVIEWER_ID,
    userEmail: "alice@reviewer.demo",
    username: "alice",
  },
  {
    id: "00000000-0000-4000-8000-000000000p03",
    amount: 500,
    source: "admin_grant",
    description: "Welcome bonus",
    createdAt: daysAgo(30),
    userId: MOCK_REVIEWER_ID,
    userEmail: "alice@reviewer.demo",
    username: "alice",
  },
];

const MOCK_REDEMPTIONS = [
  {
    id: "00000000-0000-4000-8000-000000000r01",
    amountPoints: 500,
    redemptionType: "bank_transfer",
    status: "pending" as const,
    notes: null,
    createdAt: daysAgo(7),
    updatedAt: daysAgo(7),
    userId: MOCK_REVIEWER_ID,
    userEmail: "alice@reviewer.demo",
    username: "alice",
  },
  {
    id: "00000000-0000-4000-8000-000000000r02",
    amountPoints: 1000,
    redemptionType: "airtime",
    status: "completed" as const,
    notes: "Paid via MTN",
    createdAt: daysAgo(20),
    updatedAt: daysAgo(18),
    userId: MOCK_REVIEWER_ID,
    userEmail: "alice@reviewer.demo",
    username: "alice",
  },
];

const MOCK_BRANDS = [
  {
    id: MOCK_BRAND_ID,
    companyName: "Demo Brand Ltd",
    website: "https://demo-brand.example",
    logoUrl: null,
    createdAt: daysAgo(45),
    userId: MOCK_BRAND_USER_ID,
    userEmail: "brand@adspot.demo",
    username: "demo-brand",
    adCount: 2,
  },
];

export function adminMemoryEnabled(): boolean {
  return partnerMemoryEnabled();
}

export function getMockUserByEmail(email: string) {
  const normalized = email.toLowerCase().trim();
  return MOCK_USERS.find((u) => u.email === normalized) ?? null;
}

export function getMockUserById(userId: string) {
  return MOCK_USERS.find((u) => u.id === userId) ?? null;
}

/** Demo login when AUDIT_PARTNER_MOCK=1 and Postgres is unavailable. */
export function tryMockLogin(email: string, password: string) {
  if (!adminMemoryEnabled()) return null;
  if (password !== MOCK_DEMO_PASSWORD) return null;
  const user = getMockUserByEmail(email);
  // Never grant a privileged session through the fixed demo password. Mock login
  // is limited to non-privileged demo roles (reviewer / brand) so it can never
  // mint an admin or owner token even while mock mode is on.
  if (user && (user.role === "admin" || user.role === "super_admin")) return null;
  return user;
}

function paginate<T>(items: T[], limit: number, offset: number) {
  const slice = items.slice(offset, offset + limit);
  return { items: slice, total: items.length, offset, limit };
}

export function getMockAdminUsers(opts: { limit: number; offset: number; role?: string }) {
  let users = [...MOCK_USERS];
  if (opts.role) users = users.filter((u) => u.role === opts.role);
  const { items, total, offset, limit } = paginate(users, opts.limit, opts.offset);
  return { users: items, total, offset, limit };
}

export function getMockAdminEvents(opts: {
  limit: number;
  offset: number;
  eventType?: string;
  from?: string;
  to?: string;
}) {
  let events = [...MOCK_EVENTS];
  if (opts.eventType) {
    events = events.filter((e) => e.eventType.includes(opts.eventType!));
  }
  if (opts.from) {
    const from = new Date(opts.from);
    events = events.filter((e) => e.createdAt >= from);
  }
  if (opts.to) {
    const to = new Date(opts.to);
    events = events.filter((e) => e.createdAt <= to);
  }
  events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const { items, total, offset, limit } = paginate(events, opts.limit, opts.offset);
  return { events: items, total, offset, limit };
}

export function getMockAdminStats() {
  return {
    totalUsers: MOCK_USERS.length,
    totalReviewers: MOCK_USERS.filter((u) => u.role === "reviewer").length,
    totalBrands: MOCK_USERS.filter((u) => u.role === "brand").length,
    totalAdmins: MOCK_USERS.filter((u) => u.role === "admin" || u.role === "super_admin").length,
    totalAds: 2,
    activeAds: 1,
    totalCompletions: 156,
    totalPointsIssued: 2840,
    pendingRedemptions: MOCK_REDEMPTIONS.filter((r) => r.status === "pending").length,
    completedRedemptions: MOCK_REDEMPTIONS.filter((r) => r.status === "completed").length,
  };
}

export function getMockAdminPoints(opts: { limit: number; offset: number }) {
  const { items, total, offset, limit } = paginate(MOCK_POINTS, opts.limit, opts.offset);
  return { entries: items, total, offset, limit };
}

export function getMockAdminRedemptions(opts: { limit: number; offset: number; status?: string }) {
  let redemptions = [...MOCK_REDEMPTIONS];
  if (opts.status) redemptions = redemptions.filter((r) => r.status === opts.status);
  const { items, total, offset, limit } = paginate(redemptions, opts.limit, opts.offset);
  return { redemptions: items, total, offset, limit };
}

export function getMockAdminBrands(opts: { limit: number; offset: number }) {
  const { items, total, offset, limit } = paginate(MOCK_BRANDS, opts.limit, opts.offset);
  return { brands: items, total, offset, limit };
}
