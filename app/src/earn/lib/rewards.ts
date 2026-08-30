import { customFetch } from "@workspace/api-client-react";

export interface AdReward {
  id: string;
  type: "wildcard" | "general";
  title: string;
  description: string;
  rewardValueText: string;
  discountCode: string | null;
  spotsLeft: number | null;
  alreadyClaimed: boolean;
  claimedCode: string | null;
  available: boolean;
}

export interface RewardClaim {
  id: string;
  redemptionCode: string;
  rewardTitle: string;
  rewardValueText: string;
  discountCode: string | null;
  rewardType: "wildcard" | "general";
  adId: string;
  claimedAt: string;
}

export async function fetchAdReward(adId: string): Promise<AdReward | null> {
  try {
    const data = await customFetch<{ reward: AdReward | null }>(`/api/ads/${adId}/reward`);
    return data.reward;
  } catch {
    return null;
  }
}

export async function claimReward(rewardId: string): Promise<RewardClaim> {
  const data = await customFetch<{ claim: RewardClaim }>(`/api/rewards/${rewardId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return data.claim;
}

export async function fetchMyRewards(): Promise<RewardClaim[]> {
  try {
    const data = await customFetch<{ claims: RewardClaim[] }>("/api/me/rewards");
    return data.claims ?? [];
  } catch {
    return [];
  }
}

export async function createAdReward(adId: string, data: {
  type: "wildcard" | "general";
  title: string;
  description: string;
  rewardValueText: string;
  discountCode?: string;
  maxClaims?: number;
}): Promise<void> {
  await customFetch(`/api/brands/ads/${adId}/rewards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function fetchBrandAdRewards(adId: string) {
  try {
    const data = await customFetch<{ rewards: unknown[] }>(`/api/brands/ads/${adId}/rewards`);
    return data.rewards ?? [];
  } catch {
    return [];
  }
}
