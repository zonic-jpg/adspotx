/**
 * Seed brand-specific survey questions for all 14 Nigerian YouTube ads.
 * Safe to re-run — skips ads that already have 5+ questions.
 */
import { db, pool } from "./index";
import { adsTable, brandsTable, questionsTable } from "./schema";
import { eq, count } from "drizzle-orm";

type QType = "multiple_choice" | "rating" | "open_text" | "yes_no";
interface Q { qt: QType; text: string; opts?: string[] }

// ─── Universal questions every ad gets ───────────────────────────────────────
function universalQuestions(brandName: string, productDesc: string): Q[] {
  return [
    {
      qt: "multiple_choice",
      text: `Before watching this ad, how familiar were you with ${brandName}?`,
      opts: [
        "Very familiar – I use it regularly",
        "Somewhat familiar – I've heard of it",
        "I've seen it but never used it",
        "Never heard of it before",
      ],
    },
    {
      qt: "rating",
      text: "How clearly did this ad communicate its message? (1 = very unclear, 5 = crystal clear)",
    },
    {
      qt: "multiple_choice",
      text: "How did this ad make you feel?",
      opts: ["Excited", "Happy / Entertained", "Inspired", "Curious", "Neutral", "Unconvinced"],
    },
    {
      qt: "rating",
      text: `How likely are you to try or use ${productDesc} in the next 3 months? (1 = not at all, 5 = very likely)`,
    },
    {
      qt: "multiple_choice",
      text: `After watching this ad, your impression of ${brandName} is:`,
      opts: [
        "Much more positive",
        "Slightly more positive",
        "No change",
        "Less positive than before",
      ],
    },
  ];
}

// ─── Brand-category-specific questions ───────────────────────────────────────
const brandSpecific: Record<string, Q[]> = {
  // ── Telecom ──────────────────────────────────────────────────────────────
  "MTN Nigeria": [
    {
      qt: "multiple_choice",
      text: "Which mobile network are you currently subscribed to?",
      opts: ["MTN", "Airtel", "Glo", "9mobile", "I use multiple"],
    },
    {
      qt: "multiple_choice",
      text: "What matters most to you when choosing a mobile network?",
      opts: ["Network coverage", "Affordable data bundles", "Fast internet speed", "Customer support", "Value-for-money offers"],
    },
    {
      qt: "yes_no",
      text: "Would you consider switching to or staying with MTN after watching this ad?",
    },
  ],
  "Airtel Nigeria": [
    {
      qt: "multiple_choice",
      text: "Which mobile network are you currently subscribed to?",
      opts: ["MTN", "Airtel", "Glo", "9mobile", "I use multiple"],
    },
    {
      qt: "multiple_choice",
      text: "What matters most to you when choosing a mobile network?",
      opts: ["Network coverage", "Affordable data bundles", "Fast internet speed", "Customer support", "Value-for-money offers"],
    },
    {
      qt: "yes_no",
      text: "Has Airtel's broadband service ever worked well in your area?",
    },
  ],
  // ── Fintech / Banking ─────────────────────────────────────────────────────
  "GTBank Nigeria": [
    {
      qt: "multiple_choice",
      text: "Do you currently use GTBank for banking?",
      opts: [
        "Yes – it's my main bank",
        "Yes – but as a secondary bank",
        "No – but I'm open to it",
        "No – not interested",
      ],
    },
    {
      qt: "multiple_choice",
      text: "How do you prefer to do most of your banking?",
      opts: ["Mobile app", "USSD (*737#)", "Internet banking", "Branch visit", "POS / Agent banking"],
    },
    {
      qt: "yes_no",
      text: "Would you recommend GTBank's mobile banking to someone else?",
    },
  ],
  "Flutterwave": [
    {
      qt: "multiple_choice",
      text: "How often do you send or receive money online or across borders?",
      opts: ["Daily", "Several times a week", "Monthly", "Rarely", "Never"],
    },
    {
      qt: "multiple_choice",
      text: "What payment method do you use most often?",
      opts: ["Bank transfer", "Card payment", "Mobile money", "USSD", "Cash"],
    },
    {
      qt: "yes_no",
      text: "Are you a business owner or freelancer who receives payments online?",
    },
  ],
  "Paystack": [
    {
      qt: "multiple_choice",
      text: "Are you currently a business owner or running a side hustle?",
      opts: [
        "Yes – full-time business",
        "Yes – side hustle",
        "Not yet, but planning to",
        "No – I'm an employee",
      ],
    },
    {
      qt: "multiple_choice",
      text: "What's the biggest challenge you face with accepting payments online?",
      opts: [
        "High transaction fees",
        "Trust and security concerns",
        "Technical complexity",
        "Not relevant to me",
      ],
    },
    {
      qt: "yes_no",
      text: "Would you recommend Paystack to a business owner in your network?",
    },
  ],
  // ── FMCG / Food ──────────────────────────────────────────────────────────
  "Indomie Nigeria": [
    {
      qt: "multiple_choice",
      text: "How often do you eat Indomie noodles?",
      opts: ["Daily", "Several times a week", "Once a week", "A few times a month", "Rarely"],
    },
    {
      qt: "multiple_choice",
      text: "Where do you most often buy Indomie?",
      opts: ["Supermarket / shoprite", "Neighborhood provision store", "Open market", "Online delivery", "Not applicable"],
    },
    {
      qt: "yes_no",
      text: "Would this ad make you more likely to try a new Indomie flavour?",
    },
  ],
  "Peak Milk Nigeria": [
    {
      qt: "multiple_choice",
      text: "Which dairy product do you use most at home?",
      opts: ["Peak Milk", "Other evaporated / powdered milk", "Fresh / pasteurised milk", "Plant-based milk", "I don't use dairy"],
    },
    {
      qt: "multiple_choice",
      text: "Who in your household consumes the most milk?",
      opts: ["Children / babies", "Teenagers", "Adults", "Elderly family members", "Everyone equally"],
    },
    {
      qt: "yes_no",
      text: "Did this ad reinforce your trust in Peak Milk as a nutritious choice?",
    },
  ],
  // ── Beverage ──────────────────────────────────────────────────────────────
  "Guinness Nigeria": [
    {
      qt: "multiple_choice",
      text: "How often do you consume alcoholic beverages?",
      opts: ["Several times a week", "Once a week", "A few times a month", "Occasionally / social events", "Never"],
    },
    {
      qt: "multiple_choice",
      text: "What's your preferred type of alcoholic drink?",
      opts: ["Stout / dark beer", "Lager beer", "Spirits / whisky", "Wine", "I don't drink alcohol"],
    },
    {
      qt: "yes_no",
      text: "Does this ad make Guinness feel relevant to your lifestyle?",
    },
  ],
  // ── E-commerce ────────────────────────────────────────────────────────────
  "Jumia Nigeria": [
    {
      qt: "multiple_choice",
      text: "How often do you shop online?",
      opts: ["Weekly", "Monthly", "A few times a year", "Rarely", "Never – I prefer physical stores"],
    },
    {
      qt: "multiple_choice",
      text: "What's your biggest concern when shopping online in Nigeria?",
      opts: ["Fake / substandard products", "Delivery delays", "Payment security", "Poor customer service", "I have no major concerns"],
    },
    {
      qt: "yes_no",
      text: "Would this ad make you more likely to check out Jumia for your next purchase?",
    },
  ],
  // ── Industrial / Conglomerate ─────────────────────────────────────────────
  "Dangote Group": [
    {
      qt: "multiple_choice",
      text: "Are you involved in any of the following sectors?",
      opts: ["Construction / Real estate", "Manufacturing / Industry", "Agriculture / Food production", "Logistics / Transport", "None of the above"],
    },
    {
      qt: "multiple_choice",
      text: "How do you feel about Nigerian-owned businesses competing globally?",
      opts: ["Very proud and supportive", "Positive but cautious", "Neutral", "Sceptical about quality"],
    },
    {
      qt: "yes_no",
      text: "Does this ad make you more proud to use or support Dangote products?",
    },
  ],
};

// ─── Open-ended question (always last) ───────────────────────────────────────
function closingQuestion(brandName: string): Q {
  return {
    qt: "open_text",
    text: `In your own words, what is the single most memorable thing about this ${brandName} ad?`,
  };
}

async function seedQuestions() {
  console.log("🌱 Seeding brand survey questions...");

  const allAds = await db
    .select({
      id: adsTable.id,
      title: adsTable.title,
      assetType: adsTable.assetType,
      brandName: brandsTable.companyName,
    })
    .from(adsTable)
    .innerJoin(brandsTable, eq(adsTable.brandId, brandsTable.id))
    .where(eq(adsTable.assetType, "youtube"));

  console.log(`Found ${allAds.length} YouTube ads`);

  for (const ad of allAds) {
    const [{ existing }] = await db
      .select({ existing: count() })
      .from(questionsTable)
      .where(eq(questionsTable.adId, ad.id));

    if (Number(existing) >= 5) {
      console.log(`  ↳ ${ad.title} — already has ${existing} questions, skipping`);
      continue;
    }

    // Clear any partial questions
    if (Number(existing) > 0) {
      const { sql: drizzleSql } = await import("drizzle-orm");
      await db.delete(questionsTable).where(eq(questionsTable.adId, ad.id));
    }

    const brandName = ad.brandName;
    const productDesc = brandName; // fallback

    const universal = universalQuestions(brandName, productDesc);
    const specific = brandSpecific[brandName] ?? [];
    const closing = closingQuestion(brandName);

    // Universal (5) + up to 2 brand-specific + 1 closing open-text = 6-8 questions per ad
    const allQ: Q[] = [...universal, ...specific.slice(0, 2), closing];

    for (let i = 0; i < allQ.length; i++) {
      const q = allQ[i]!;
      await db.insert(questionsTable).values({
        adId: ad.id,
        sortOrder: i,
        questionType: q.qt,
        questionText: q.text,
        options: q.opts ?? null,
      });
    }

    console.log(`  ✓ ${brandName} — "${ad.title}" — ${allQ.length} questions seeded`);
  }

  console.log("✅ Questions seeded successfully!");
  await pool.end();
}

seedQuestions().catch(err => {
  console.error("Seed-questions failed:", err);
  process.exit(1);
});
