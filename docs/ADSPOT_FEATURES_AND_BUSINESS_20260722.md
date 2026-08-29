# AdSpot — Features & Business Analysis

**Document date: 22 July 2026**  
**Confidential — AdSpot Nigeria / Africa**

---

## Executive Summary

**22 July 2026** — AdSpot is a rewarded-attention advertising platform built for Nigeria and broader Africa. Instead of interruptive banners that users skip, AdSpot pays reviewers to watch brand creatives, answer comprehension questions, and earn points redeemable for airtime, data, and gift vouchers. Brands receive verified attention metrics, first-party survey responses, and fraud-scored engagement — not vanity impressions.

AdSpot unifies three audiences in one deployable stack: reviewers (`/earn`), brands (`/brands`), and platform operators (`/brands/admin`). The product is production-ready with PostgreSQL-backed auth, campaign tooling, gamified review sessions, leaderboards, referral loops, and admin financial controls. This document maps product features to revenue opportunities and presents an aggressive three-year profit-and-loss outlook for the Nigerian market, with expansion assumptions into West and East Africa.

---

## The Problem

| Pain point | Impact in Nigeria / Africa |
|------------|---------------------------|
| **Ad nuisance** | Mobile users install ad blockers or scroll past creatives; brands pay CPM for unseen inventory. |
| **Low verified attention** | Video completion rates on social feeds are opaque; bots and passive autoplay inflate metrics. |
| **Brand waste** | FMCG, telco, and fintech advertisers spend billions of NGN annually with weak feedback loops on message comprehension. |
| **Reviewer distrust** | Reward apps often feel scammy; users abandon before KYC or payout thresholds. |
| **Data poverty** | Brands lack affordable, consented first-party insight from young urban and peri-urban consumers. |

---

## The Solution

AdSpot replaces passive impressions with **gamified, verified attention**:

1. **Watch** — Reviewers must meet `minWatchSeconds` on video/image creatives (`VideoPlayer`, `/earn/review/:id`).
2. **Answer** — Brands attach up to 10 questions (MCQ, rating, emoji, yes/no, open text) to prove comprehension.
3. **Score** — Server-side session tracking, fraud signals, and proverb bonus challenges gate point payouts.
4. **Earn** — Points ledger, leaderboard rank, referrals, and gift/redemption flows keep reviewers returning.
5. **Learn** — Brands see analytics, AI summaries, and per-question breakdowns to optimise campaigns.

---

## Feature-to-Business Mapping

| Business opportunity | App feature | Route / component |
|---------------------|-------------|-------------------|
| Acquire reviewers at low CAC | Landing + self-serve registration | `/`, `/earn/register` — `Landing`, `Register` |
| Retain daily active reviewers | Points balance, ad feed, streak-style UX | `/earn/dashboard` — `Dashboard` |
| Prove attention before payout | Timed watch + session lifecycle | `/earn/review/:id` — `ReviewSession`, `VideoPlayer` |
| Brand message comprehension | Custom question builder on ads | `/brands/ads/new` — `CreateAd` |
| Premium creative hosting | Object storage upload | `CreateAd` + `@workspace/object-storage-web` |
| Gamification & competition | Leaderboard + eligibility rules | `/earn/leaderboard` — `Leaderboard` |
| Viral reviewer growth | Referral codes & bonuses | `server/routes/referrals.ts`, points ledger |
| Reviewer rewards / gifts | Airtime & voucher redemption | `ReviewSession` rewards, `server/routes/gifts.ts` |
| Brand campaign management | CRUD ads, status, budgets | `/brands/ads`, `/brands/ads/:id` — `MyAds`, `AdDetail` |
| Brand ROI analytics | Dashboard charts & exports | `/brands/dashboard` — `Dashboard`, `BrandAnalytics` |
| AI campaign insights | OpenAI-powered summaries | `AISummaryPanel`, `lib/integrations-openai-ai-server` |
| Package / bundle sales | Prepaid impression bundles | `AllocateBundle`, `server/routes/packages.ts` |
| Platform revenue control | Admin financials & settings | `/brands/admin/financials` — `AdminFinancials` |
| Fraud & quality enforcement | Server fraud module + admin review | `server/routes/fraud.ts`, `AdminAds` |
| Operator oversight | User, event, ad moderation | `/brands/admin/*` — `AdminDashboard`, `AdminUsers`, `AdminEvents` |
| Trust & compliance | Role-separated portals (reviewer vs brand) | `/earn/login` vs `/brands/login`, `auth.ts` |
| Deploy to African cloud | Unified Node deploy + split S3/CloudFront | `STAGING_GUIDANCE.md`, `pnpm start` |
| Pre-launch quality gate | Hostile audit script | `scripts/hostile-audit.mjs` |

---

## Revenue Pathways

| Stream | Model | Notes |
|--------|-------|-------|
| **Brand campaigns** | Prepaid packages (impressions + CPE) | Brands fund wallet; platform takes margin on each verified review. |
| **CPM / CPE** | Cost per mille viewed + cost per engaged response | Benchmark: NGN 800–2,500 CPM equivalent; NGN 15–45 per completed review with questions. |
| **Premium analytics** | Subscription tier for AI summaries, exports, cohort filters | Target: NGN 150k–500k/month per enterprise brand. |
| **Reviewer rewards pool fees** | 12–18% platform fee on gross rewards budget | Brands allocate points; AdSpot retains fee + unredeemed float. |
| **Referral bounties (net)** | Brands sponsor referral bonuses; platform takes admin fee | Drives organic reviewer acquisition. |
| **Admin packages** | White-label / API access for telco & agency partners | Year 2+ revenue line. |

---

## Aggressive 3-Year P&L (NGN millions)

**Base currency:** Nigerian Naira (NGN). FX assumption: USD 1 = NGN 1,550.  
**Accounting year:** July–June, aligned to document date **22 July 2026**.

### Key assumptions

| Assumption | Year 1 (FY26–27) | Year 2 (FY27–28) | Year 3 (FY28–29) |
|------------|------------------|------------------|------------------|
| Active reviewers (monthly) | 25k → 80k | 80k → 250k | 250k → 600k |
| Paying brand accounts | 12 → 45 | 45 → 120 | 120 → 280 |
| Avg brand monthly spend | NGN 1.2M | NGN 2.8M | NGN 4.5M |
| Platform take rate (gross) | 28% | 32% | 35% |
| Premium analytics adopters | 3 | 18 | 55 |
| Team size (FTE) | 8 | 22 | 45 |
| Nigeria share of revenue | 85% | 70% | 55% |

### P&L summary

| Line item | Year 1 | Year 2 | Year 3 |
|-----------|--------|--------|--------|
| **Gross brand spend (GMV)** | 216 | 1,008 | 2,520 |
| Platform revenue (net) | **61** | **322** | **882** |
| Premium analytics | 5 | 32 | 99 |
| Partner / API fees | 0 | 8 | 45 |
| **Total revenue** | **66** | **362** | **1,026** |
| Reviewer rewards COGS | (28) | (130) | (310) |
| Cloud, SMS, payouts | (9) | (38) | (95) |
| **Gross profit** | **29** | **194** | **621** |
| Sales & marketing | (18) | (72) | (165) |
| Product & engineering | (22) | (58) | (120) |
| G&A / legal / compliance | (8) | (22) | (48) |
| **EBITDA** | **(19)** | **42** | **288** |
| EBITDA margin | -29% | 12% | 28% |

*Year 1 intentional loss funds Lagos/Lagos+Abuja launch, telco gift-card rails, and fraud ops. Year 2 EBITDA positive on Nigeria scale; Year 3 assumes Ghana + Kenya soft launch.*

---

## Market Analysis — Nigeria & Africa

### Market size

- **Nigeria digital ad spend (2026 est.):** USD 1.1–1.4B (~NGN 1.7–2.2T), growing 15–20% YoY (social + mobile video dominant).
- **Rewarded engagement segment:** <2% penetrated — large whitespace vs. coupon and survey apps.
- **Africa ex-Nigeria (2028 TAM for AdSpot categories):** USD 2.5–3.2B digital ad spend; mobile-first youth demographic (>500M under-35).

### Target segments

| Segment | Profile | AdSpot value |
|---------|---------|--------------|
| **Telcos & fintech** | MTN, Airtel, OPay, Moniepoint | High-volume awareness + comprehension testing |
| **FMCG** | Beverages, personal care, sachet goods | Rural/urban message testing at scale |
| **Media agencies** | Insignia, Noah's Ark, X3M | Performance alternative to Meta reach campaigns |
| **Reviewers** | 18–35, urban, smartphone | Earn airtime/data for attention already spent online |

---

## Competition

| Competitor | Strength | AdSpot counter |
|------------|----------|----------------|
| **Meta (Facebook/Instagram)** | Reach, self-serve ads | No verified comprehension; ad fatigue |
| **Google / YouTube** | Intent + video scale | Skip culture; expensive for local brands |
| **SurveyMonkey / Typeform** | Research depth | No media delivery or rewards loop |
| **Local reward apps** | Payout familiarity | Thin brand tooling; weak fraud controls |

---

## Moat

1. **Verified attention graph** — Proprietary session + question scoring dataset per reviewer.
2. **Dual-sided liquidity** — Same codebase serves brands and reviewers with shared ledger integrity.
3. **Fraud stack** — Server-side `fraud.ts`, rate limits, portal separation, hostile audit CI gate.
4. **Local payout rails** — Gift/airtime redemption tuned for NGN micro-rewards.
5. **First-party data consented** — GDPR-style posture with explicit watch-and-answer consent per session.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Reviewer farming / bots | Fraud module, device signals, manual admin review |
| Regulatory (NDPC, CBN e-money) | Partner with licensed payout providers; data minimisation |
| Brand concentration | Agency channel + self-serve SMB tier |
| Meta price wars | CPE pricing tied to verified outcomes, not impressions |
| Payout leakage | Escrow-style brand wallets; unredeemed points liability accounting |

---

## Audience Breakdown

### Brands (`/brands`)

- Create and fund campaigns, upload creatives, attach questions, monitor analytics.
- Roles: `brand`, `admin`, `super_admin`.
- Key paths: `/brands/dashboard`, `/brands/ads/new`, `/brands/settings`.

### Reviewers (`/earn`)

- Discover ads, complete review sessions, climb leaderboard, redeem rewards.
- Role: `reviewer` (isolated login portal).
- Key paths: `/earn/dashboard`, `/earn/review/:id`, `/earn/leaderboard`, `/earn/profile`.

### Platform operators

- Manage users, ads, events, financial settings, fraud queues.
- Key paths: `/brands/admin/dashboard`, `/brands/admin/financials`, `/brands/admin/users`.

---

## Conclusion

AdSpot converts Africa's attention economy from a cost centre for users into a shared value pool for brands and reviewers. The shipped product — unified SPA + API, PostgreSQL schema, gamified review flow, and admin financial controls — is the foundation for an aggressive but defensible growth plan. With disciplined fraud ops and telco-grade payouts, the platform targets EBITDA positivity in Year 2 and NGN 1B+ revenue run-rate by Year 3.

---

*AdSpot Features & Business Analysis — 22 July 2026 — Page footer on all printed pages.*
