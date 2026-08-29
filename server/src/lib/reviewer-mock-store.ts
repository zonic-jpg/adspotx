/**
 * Reviewer-facing mock data when AUDIT_PARTNER_MOCK=1 (no Postgres).
 */
import { randomUUID } from "node:crypto";
import { adminMemoryEnabled, MOCK_REVIEWER_ID } from "./admin-memory-store";
import { computePointsAwarded } from "./review-scoring";

export const MOCK_AD_ID = "00000000-0000-4000-8000-000000000a01";
export const MOCK_SESSION_ID = "00000000-0000-4000-8000-000000000b01";

const MOCK_AD = {
  id: MOCK_AD_ID,
  title: "Summer Splash Campaign",
  description: "Watch our summer launch video and share your honest feedback on the creative.",
  assetUrl: "dQw4w9WgXcQ",
  assetType: "youtube",
  minWatchSeconds: 5,
  pointReward: 120,
  multiplierFactor: "1.0",
  status: "active",
  brandId: "00000000-0000-4000-8000-000000000004",
  brandName: "Demo Brand",
  createdAt: new Date(),
  proverbQuestion: "What product category was featured in this ad?",
  proverbAnswer: "Beverages",
  proverbBonusPoints: 25,
};

const MOCK_QUESTIONS = [
  {
    id: "00000000-0000-4000-8000-000000000c01",
    adId: MOCK_AD_ID,
    questionText: "What product category was featured in this ad?",
    questionType: "multiple_choice",
    options: ["Beverages", "Electronics", "Fashion", "Food"],
    sortOrder: 0,
  },
  {
    id: "00000000-0000-4000-8000-000000000c02",
    adId: MOCK_AD_ID,
    questionText: "How would you rate the overall message clarity?",
    questionType: "rating",
    options: null,
    sortOrder: 1,
  },
];

/** Mutable mock points balance — increments when reviews complete in mock mode. */
let mockReviewerBalance = 2840;
const mockCompletedSessions = new Set<string>();
const mockActiveSessions = new Set<string>();
const mockBrandAds = [
  {
    id: MOCK_AD_ID,
    title: MOCK_AD.title,
    status: "active" as const,
    totalViews: 42,
    completedViews: 28,
    completionRate: 0.67,
    pointsAwarded: 3360,
    averageWatchSeconds: 38,
    averageRating: 4.2,
    createdAt: new Date(),
  },
];

export function reviewerMockEnabled(): boolean {
  return adminMemoryEnabled();
}

export function getMockAdFeed(limit: number, offset: number) {
  const ads = [{ ...MOCK_AD, questionCount: MOCK_QUESTIONS.length }];
  return { ads: ads.slice(offset, offset + limit), total: 1, offset, limit };
}

export function getMockAdDetail(adId: string) {
  if (adId !== MOCK_AD_ID) return null;
  return { ...MOCK_AD, questions: MOCK_QUESTIONS };
}

export function getMockPointsBalance(userId: string) {
  const balance = userId === MOCK_REVIEWER_ID ? mockReviewerBalance : 0;
  return { userId, balance, totalEarned: balance };
}

export function getMockLedger(limit: number, offset: number) {
  return { entries: [], total: 0, offset, limit };
}

export function createMockReviewSession(adId: string, userId: string) {
  if (adId !== MOCK_AD_ID) return null;
  const sessionId = randomUUID();
  mockActiveSessions.add(sessionId);
  return { id: sessionId, userId, adId, status: "in_progress" };
}

export function completeMockReview(
  sessionId: string,
  userId: string,
  watchSeconds: number,
  proverbAnswer?: string | null,
) {
  if (!mockActiveSessions.has(sessionId) && sessionId !== MOCK_SESSION_ID) return null;
  if (mockCompletedSessions.has(sessionId)) {
    const err = new Error("Review already completed") as Error & { code: string };
    err.code = "ALREADY_COMPLETED";
    throw err;
  }

  const basePoints = computePointsAwarded(MOCK_AD.pointReward, MOCK_AD.multiplierFactor);
  let bonus = 0;
  if (
    proverbAnswer &&
    MOCK_AD.proverbAnswer &&
    proverbAnswer.trim().toLowerCase() === MOCK_AD.proverbAnswer.trim().toLowerCase()
  ) {
    bonus = MOCK_AD.proverbBonusPoints;
  }
  const pointsAwarded = basePoints + bonus;

  if (userId === MOCK_REVIEWER_ID) {
    mockReviewerBalance += pointsAwarded;
  }
  mockCompletedSessions.add(sessionId);
  mockActiveSessions.delete(sessionId);

  return {
    session: {
      id: sessionId,
      userId,
      adId: MOCK_AD_ID,
      status: "completed",
      watchSeconds,
      pointsAwarded,
      completedAt: new Date(),
    },
    pointsAwarded,
    totalBalance: userId === MOCK_REVIEWER_ID ? mockReviewerBalance : pointsAwarded,
    gift: null,
  };
}

/** Reset mock reviewer state between audit runs. */
export function resetMockReviewerState() {
  mockReviewerBalance = 2840;
  mockCompletedSessions.clear();
  mockActiveSessions.clear();
}

export function getMockLeaderboard() {
  return {
    entries: [
      {
        rank: 1,
        username: "alice",
        points: mockReviewerBalance,
        pointsTotal: mockReviewerBalance,
        userId: MOCK_REVIEWER_ID,
        isCurrentUser: true,
      },
    ],
    myRank: 1,
  };
}

export function getMockBrandAds() {
  return { ads: [...mockBrandAds], total: mockBrandAds.length };
}

export function deleteMockBrandAd(adId: string, brandUserId: string) {
  const idx = mockBrandAds.findIndex((a) => a.id === adId);
  if (idx < 0) return null;
  const [removed] = mockBrandAds.splice(idx, 1);
  return { deleted: true, archived: false, ad: removed, brandUserId };
}

export function getMockBrandAnalytics() {
  const dailyTrend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    dailyTrend.push({
      date: d.toISOString().slice(0, 10),
      completions: 280 + Math.floor(Math.random() * 120),
    });
  }
  return {
    hasCampaigns: true,
    overview: {
      totalViews: 12480,
      totalCompletions: 8920,
      avgWatchSeconds: 42,
      completionRate: 0.71,
      totalPoints: 1068000,
    },
    allAds: [{ id: MOCK_AD_ID, title: "Summer Splash Campaign", status: "active", pointReward: 120, multiplierFactor: "1.0" }],
    demographics: {
      gender: [
        { label: "male", count: 4200, pct: 48 },
        { label: "female", count: 4520, pct: 52 },
      ],
      ageBand: [
        { label: "18-24", count: 3200, pct: 36 },
        { label: "25-34", count: 4100, pct: 46 },
        { label: "35-44", count: 2100, pct: 24 },
      ],
      state: [
        { label: "Lagos", count: 4200, pct: 47 },
        { label: "FCT – Abuja", count: 1800, pct: 20 },
        { label: "Rivers", count: 980, pct: 11 },
      ],
      timeOfDay: [
        { label: "Morning", count: 2100 },
        { label: "Afternoon", count: 3200 },
        { label: "Evening", count: 2800 },
        { label: "Night", count: 1020 },
      ],
    },
    surveyInsights: [
      {
        questionId: "00000000-0000-4000-8000-000000000c01",
        adId: MOCK_AD_ID,
        questionText: "What product category was featured?",
        questionType: "multiple_choice",
        totalAnswers: 3800,
        avgRating: null,
        positivityScore: 0.84,
        distribution: [
          { option: "Beverages", count: 2100, pct: 55 },
          { option: "Food", count: 1200, pct: 32 },
        ],
        samples: [],
      },
    ],
    dailyTrend,
  };
}

export function getMockBrandComments() {
  return {
    comments: [
      {
        id: "c1",
        comment: "Great summer vibe — really memorable creative!",
        completedAt: new Date().toISOString(),
        adTitle: "Summer Splash Campaign",
        reviewer: { username: "alice", gender: "female", ageBand: "25-34", state: "Lagos" },
      },
      {
        id: "c2",
        comment: "Message was clear and the music was catchy.",
        completedAt: new Date().toISOString(),
        adTitle: "Summer Splash Campaign",
        reviewer: { username: "bob", gender: "male", ageBand: "18-24", state: "FCT – Abuja" },
      },
    ],
  };
}
