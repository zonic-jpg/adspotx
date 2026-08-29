const getToken = () => localStorage.getItem("adspot_token") ?? "";

function authHeaders() {
  const t = getToken();
  return { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

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
  const res = await fetch(`/api/ads/${adId}/reward`, { headers: authHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data.reward;
}

export async function claimReward(rewardId: string): Promise<RewardClaim> {
  const res = await fetch(`/api/rewards/${rewardId}/claim`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to claim reward");
  }
  return (await res.json()).claim;
}

export async function fetchMyRewards(): Promise<RewardClaim[]> {
  const res = await fetch("/api/me/rewards", { headers: authHeaders() });
  if (!res.ok) return [];
  return (await res.json()).claims ?? [];
}

export async function createAdReward(adId: string, data: {
  type: "wildcard" | "general";
  title: string;
  description: string;
  rewardValueText: string;
  discountCode?: string;
  maxClaims?: number;
}): Promise<void> {
  const res = await fetch(`/api/brands/ads/${adId}/rewards`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create reward");
}

export async function fetchBrandAdRewards(adId: string) {
  const res = await fetch(`/api/brands/ads/${adId}/rewards`, { headers: authHeaders() });
  if (!res.ok) return [];
  return (await res.json()).rewards ?? [];
}
