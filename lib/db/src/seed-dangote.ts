import { db, pool } from "./index";
import {
  usersTable,
  brandsTable,
  adsTable,
  questionsTable,
  reviewSessionsTable,
  answersTable,
  pointsLedgerTable,
  reviewerProfilesTable,
  eventsLogTable,
  EVENT_TYPES,
} from "./schema";
import bcrypt from "bcryptjs";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const NIGERIAN_STATES = [
  "Lagos", "Kano", "Rivers", "FCT – Abuja", "Oyo", "Kaduna", "Delta",
  "Enugu", "Anambra", "Imo", "Edo", "Ogun", "Borno", "Katsina", "Sokoto",
  "Bauchi", "Adamawa", "Plateau", "Kwara", "Cross River", "Ondo", "Ekiti",
  "Osun", "Abia", "Benue", "Kebbi", "Niger", "Taraba", "Zamfara",
] as const;

const GENDERS = ["male", "female"] as const;
const AGE_BANDS = ["18_24", "25_34", "35_44", "45_54", "55_plus"] as const;
const EMPLOYMENT = ["employed", "self_employed", "student", "unemployed", "retired"] as const;
const EDUCATION = ["primary", "secondary", "bachelors", "masters", "phd", "other"] as const;
const CITIES = ["Ikeja", "Lekki", "Wuse", "Garki", "Port Harcourt City", "Nnewi", "Sabon Gari", "Bodija", "Uyo Central", "Warri South"] as const;
const INCOME_BANDS = ["under_100k", "100k_300k", "300k_700k", "700k_1_5m", "over_1_5m"] as const;
const SECTORS_NG = ["Technology", "Finance", "Retail", "Agriculture", "Education", "Healthcare", "Media", "Government", "Hospitality", "Manufacturing"] as const;
const DEVICES = ["android", "android", "ios", "desktop"] as const; // android-weighted, realistic for NG
const MARITAL = ["single", "married", "other"] as const;
const INTERESTS_NG = ["Fashion", "Sports", "Music", "Tech", "Food", "Movies", "Finance", "Travel", "Gaming", "Fitness"] as const;

const DANGOTE_COMMENTS = [
  "The Dangote cement ad really resonated with me. Quality is undeniable!",
  "I've used Dangote products for years. Great to see them on this platform.",
  "Very professional ad. Dangote is truly a pride of Africa.",
  "The ad was clear and informative. Would definitely recommend Dangote cement.",
  "Impressive! Shows why Dangote leads the market in Nigeria.",
  "As a contractor, I trust Dangote cement above all others. The ad confirms it.",
  "Very relatable ad for everyday Nigerians. Thumbs up!",
  "Love the patriotic feel of the campaign. Made in Nigeria, used across Africa.",
  "Dangote products are everywhere in Kano. Good to see the ad campaign.",
  "The quality message came through clearly. Will buy again.",
  "Solid ad. Dangote's dominance in the cement sector is well-deserved.",
  "My family has been using Dangote for over a decade. No regrets.",
  "The ad made me want to upgrade my home renovation project with Dangote.",
  "Short, punchy, to the point. Excellent advertising from the Dangote brand.",
  "As a civil engineer, I appreciate the technical accuracy in the messaging.",
  "Price point is competitive for the quality. Ad represents that well.",
  "The brand trust is already there, the ad just reinforced it for me.",
  "Would love to see Dangote expand into more product lines. Exciting times.",
  "The ad could use more local language elements — more Pidgin maybe?",
  "Very strong brand. The ad did justice to what Dangote represents.",
  "Saw this ad at the right time — currently building a house in Abuja.",
  "Dangote is synonymous with quality in Nigeria. Ad reflects that perfectly.",
  "Good production quality. The message about durability really hit home.",
  "I've recommended Dangote cement to my clients many times. Great ad.",
  "The ad feels authentic — not overdone. Real Nigerian feel to it.",
  "Watched it twice. The confidence in the brand comes through clearly.",
  "As a mother building a home for my children, Dangote gives me confidence.",
  "Great campaign! Dangote should also show more about their flour products.",
  "The testimonial angle works well. Nigerians trust word of mouth.",
  "Love how the ad shows the product in real construction scenarios.",
  "My village people use Dangote exclusively. Very trustworthy brand.",
  "Ad was engaging from start to finish. No dull moments.",
  "Dangote is doing great work for Nigeria's economy. Ad reflects that.",
  "Clear messaging, strong brand presence. Would watch again.",
  "The ad reminded me to place an order for my building project in Lagos.",
  "Excellent quality, excellent ad. Five stars from me.",
  "I liked how the ad focused on strength and durability. That's what matters.",
  "The campaign speaks directly to builders and homeowners. Very targeted.",
  "Would have liked more info on pricing but overall a solid ad.",
  "Dangote brand always delivers. This ad is no exception.",
  "The visuals were stunning. Shows construction in a positive Nigerian light.",
  "As a quantity surveyor, I specify Dangote in all my projects. Great ad.",
  "The ad captures the essence of why Dangote is Nigeria's #1 brand.",
  "Very motivating. Made me proud to be Nigerian seeing this brand succeed.",
  "The music in the ad was catchy. Stayed with me afterwards.",
  "Product messaging was spot on. Would recommend to fellow contractors.",
  "Too short but very impactful. Quality over quantity — like the cement!",
  "I've switched to Dangote from foreign brands. No going back.",
  "The ad gave me confidence in the product for my upcoming project in Imo.",
  "Dangote's reach across Nigeria is impressive. Ad captures the scale well.",
  "Simple, effective, trustworthy. That's Dangote and that's this ad.",
  "The ad touched on infrastructure development — very timely for Nigeria.",
  "Watched with my husband. We're both convinced to use Dangote for our project.",
  "A little more detail on specifications would be useful but overall great.",
  "Love the emphasis on Nigerian excellence in the ad creative.",
  "Strong visuals, strong message. Aligns with Dangote's market positioning.",
  "Dangote is feeding Nigeria and building Nigeria. This ad shows both.",
  "The ad's focus on reliability matches my personal experience with the product.",
  "Made me think about switching from my current supplier to Dangote.",
  "Great job on the ad! Dangote is truly transforming Nigeria.",
  "Cement quality has always been top-notch. Glad they're advertising more.",
  "The ad was professional and I liked the Nigerian talent featured in it.",
  "As a real estate developer, Dangote cement is my go-to. Love this ad.",
  "The ad was persuasive without being pushy. Perfect for the brand.",
  "Reminds me why I've been loyal to Dangote for so many years.",
  "Excellent campaign. Shows Dangote understands their Nigerian customers.",
  "The ad was engaging for my demographic — working class Nigerian.",
  "Would love to see Dangote advertise their sugar and flour products too.",
  "The imagery of strong Nigerian homes built with Dangote was powerful.",
  "Ad felt genuine and not like typical corporate advertising. Refreshing.",
  "I'm in construction. This ad speaks directly to me. Very relevant.",
  "The comparison with imported cement is implied but effective.",
  "Trusted brand, great ad. Will share this with my estate agent network.",
  "The durability angle resonates with me as someone building to last.",
  "Beautiful execution. Shows Dangote knows their audience.",
  "Very relevant to my life right now as I'm renovating my property.",
  "The pride of using Nigerian products came through in the ad.",
  "Good pacing. Didn't feel too long or too rushed.",
  "Dangote should do more ads like this across all platforms.",
  "The sustainability message was subtle but I caught it. Well done.",
  "Made me curious to visit the Dangote website for more information.",
  "The ad spoke to both individual buyers and large-scale contractors. Smart.",
  "Nigerian brands like Dangote deserve more visibility. This ad helps.",
  "I'm in Kaduna and Dangote cement is everywhere here. Good ad.",
  "The call to action at the end was clear and actionable.",
  "Watching this from Port Harcourt — Dangote is big here too!",
  "The emphasis on job creation resonated with me. Patriotic angle worked.",
  "Overall impression: very positive. Would watch more Dangote ads.",
  "Short and punchy is the right approach for this type of product.",
  "Ad reinforces why Dangote remains the gold standard in Nigeria.",
  "As a civil engineering student, this ad is inspiring for our industry.",
  "Very confident brand voice. Exactly what Dangote should project.",
  "Touched on quality, durability, and trust. Hit all the right notes.",
  "Fantastic campaign. Glad to be reviewing content from Dangote.",
  "The Nigerian landscape in the ad background was a nice touch.",
  "Ad was clear about the value proposition. No confusion.",
  "Love how Dangote is investing in digital advertising. Smart move.",
  "The production values are high — befitting a brand of Dangote's stature.",
  "Watching from Enugu. Dangote is very popular here for construction.",
  "The ad made an emotional connection for me. That's effective advertising.",
  "I'd give this ad a 10/10 for clarity, relevance, and brand alignment.",
];

async function findOrCreateUser(values: {
  email: string;
  passwordHash: string;
  username: string;
  role: "reviewer" | "brand" | "admin";
}) {
  const [inserted] = await db
    .insert(usersTable)
    .values(values)
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, values.email))
    .limit(1);

  return existing!;
}

async function seedDangote() {
  console.log("🌱 Seeding 100 Dangote reviewers...");

  const passwordHash = await bcrypt.hash("password123", 10);

  // Find Dangote brand
  const dangoteUser = await findOrCreateUser({
    email: "dangote@adspot.demo",
    passwordHash,
    username: "dangote_brand",
    role: "brand",
  });

  let [dangoteBrand] = await db
    .select()
    .from(brandsTable)
    .where(eq(brandsTable.userId, dangoteUser.id))
    .limit(1);

  if (!dangoteBrand) {
    const [created] = await db.insert(brandsTable).values({
      userId: dangoteUser.id,
      companyName: "Dangote Group",
      website: "https://dangote.com",
    }).returning();
    dangoteBrand = created!;
    console.log("✓ Dangote brand created");
  } else {
    console.log("✓ Dangote brand found");
  }

  // Ensure Dangote has ads
  let dangoteAds = await db.select().from(adsTable).where(eq(adsTable.brandId, dangoteBrand.id));

  if (dangoteAds.length === 0) {
    console.log("Creating Dangote ads...");
    const [cement] = await db.insert(adsTable).values({
      brandId: dangoteBrand.id,
      title: "Dangote Cement — Building Nigeria's Future",
      description: "The cement that built a nation. Strong, durable, trusted by millions.",
      assetUrl: "dQw4w9WgXcQ",
      assetType: "youtube",
      minWatchSeconds: 15,
      pointReward: 20,
      multiplierFactor: "1.5",
      status: "active",
    }).returning();

    const [flour] = await db.insert(adsTable).values({
      brandId: dangoteBrand.id,
      title: "Dangote Flour — Taste the Difference",
      description: "Premium quality flour for Nigeria's finest kitchens.",
      assetUrl: "L_jWHffIx5E",
      assetType: "youtube",
      minWatchSeconds: 12,
      pointReward: 15,
      multiplierFactor: "1.0",
      status: "active",
    }).returning();

    const [sugar] = await db.insert(adsTable).values({
      brandId: dangoteBrand.id,
      title: "Dangote Sugar — Pure, Nigerian, Trusted",
      description: "Sweetening lives across Nigeria with the finest quality sugar.",
      assetUrl: "9bZkp7q19f0",
      assetType: "youtube",
      minWatchSeconds: 10,
      pointReward: 12,
      multiplierFactor: "1.2",
      status: "active",
    }).returning();

    // Add questions to cement ad
    await db.insert(questionsTable).values([
      { adId: cement!.id, sortOrder: 0, questionType: "rating", questionText: "How would you rate this Dangote Cement ad overall? (1-5)" },
      { adId: cement!.id, sortOrder: 1, questionType: "multiple_choice", questionText: "What matters most to you when buying cement?", options: ["Strength & durability", "Price", "Brand reputation", "Availability"] },
      { adId: cement!.id, sortOrder: 2, questionType: "yes_no", questionText: "Would you choose Dangote Cement for your next building project?" },
      { adId: cement!.id, sortOrder: 3, questionType: "emoji", questionText: "How did this ad make you feel?", options: ["😍", "👍", "😐", "🤔", "❤️🇳🇬"] },
      { adId: cement!.id, sortOrder: 4, questionType: "multiple_choice", questionText: "Which Dangote product do you use most?", options: ["Cement", "Flour", "Sugar", "None yet", "All of them"] },
    ]);

    // Add questions to flour ad
    await db.insert(questionsTable).values([
      { adId: flour!.id, sortOrder: 0, questionType: "rating", questionText: "Rate the ad quality (1-5)" },
      { adId: flour!.id, sortOrder: 1, questionType: "yes_no", questionText: "Do you currently use Dangote Flour at home?" },
      { adId: flour!.id, sortOrder: 2, questionType: "multiple_choice", questionText: "How often do you bake or cook with flour?", options: ["Daily", "Weekly", "Monthly", "Rarely"] },
    ]);

    // Add questions to sugar ad
    await db.insert(questionsTable).values([
      { adId: sugar!.id, sortOrder: 0, questionType: "rating", questionText: "How relevant was this ad to your lifestyle? (1-5)" },
      { adId: sugar!.id, sortOrder: 1, questionType: "yes_no", questionText: "Would you switch to Dangote Sugar based on this ad?" },
      { adId: sugar!.id, sortOrder: 2, questionType: "emoji", questionText: "How do you feel about Nigerian-made sugar?", options: ["🇳🇬❤️", "👍", "😐", "🤔"] },
    ]);

    dangoteAds = await db.select().from(adsTable).where(eq(adsTable.brandId, dangoteBrand.id));
    console.log(`✓ Created ${dangoteAds.length} Dangote ads with questions`);
  }

  const questions = await Promise.all(
    dangoteAds.map(ad => db.select().from(questionsTable).where(eq(questionsTable.adId, ad.id)))
  );

  // Create 100 reviewers with varied profiles
  const reviewers = [];
  for (let i = 1; i <= 100; i++) {
    const gender = GENDERS[i % GENDERS.length]!;
    const ageBand = AGE_BANDS[i % AGE_BANDS.length]!;
    const state = NIGERIAN_STATES[i % NIGERIAN_STATES.length]!;
    const employment = EMPLOYMENT[i % EMPLOYMENT.length]!;
    const education = EDUCATION[i % EDUCATION.length]!;
    const city = CITIES[i % CITIES.length]!;
    const incomeBand = INCOME_BANDS[i % INCOME_BANDS.length]!;
    const occupationSector = SECTORS_NG[i % SECTORS_NG.length]!;
    const deviceType = DEVICES[(i * 7) % DEVICES.length]!;
    const maritalStatus = MARITAL[(i * 3) % MARITAL.length]!;
    const interests = [INTERESTS_NG[i % INTERESTS_NG.length]!, INTERESTS_NG[(i * 5 + 2) % INTERESTS_NG.length]!];

    const email = `dangote_reviewer_${i}@test.demo`;
    const username = `reviewer_ng_${i}`;

    const user = await findOrCreateUser({ email, passwordHash, username, role: "reviewer" });

    // Create reviewer profile
    await db.insert(reviewerProfilesTable).values({
      userId: user.id,
      gender,
      ageBand,
      state,
      employmentStatus: employment,
      educationLevel: education,
      city,
      incomeBand,
      occupationSector,
      deviceType,
      maritalStatus,
      interests,
    }).onConflictDoNothing();

    reviewers.push(user);
  }
  console.log(`✓ ${reviewers.length} reviewer accounts + profiles created`);

  // Create review sessions with varied timing and comments
  let sessionCount = 0;
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < reviewers.length; i++) {
    const reviewer = reviewers[i]!;
    const numAds = (i % 3) + 1; // 1-3 ads per reviewer

    for (let j = 0; j < numAds; j++) {
      const adIndex = (i + j) % dangoteAds.length;
      const ad = dangoteAds[adIndex]!;
      const adQuestions = questions[adIndex] ?? [];

      // Spread over last 14 days with varied times of day
      const daysBack = Math.random() * 14;
      const hoursInDay = [7, 9, 11, 13, 15, 17, 19, 21, 23][(i + j) % 9]!; // varied hours
      const completedAt = new Date(now - daysBack * 24 * 60 * 60 * 1000);
      completedAt.setHours(hoursInDay, Math.floor(Math.random() * 60), 0, 0);

      const pointsBase = ad.pointReward;
      const pointsAwarded = Math.round(pointsBase * (0.9 + Math.random() * 0.2));
      const comment = DANGOTE_COMMENTS[(i * 3 + j) % DANGOTE_COMMENTS.length] ?? null;

      const [session] = await db.insert(reviewSessionsTable).values({
        userId: reviewer.id,
        adId: ad.id,
        status: "completed",
        completedAt,
        startedAt: new Date(completedAt.getTime() - (15 + Math.floor(Math.random() * 45)) * 1000),
        watchSeconds: ad.minWatchSeconds + Math.floor(Math.random() * 30),
        pointsAwarded,
        comment,
      }).returning();

      // Insert answers for each question
      if (adQuestions.length > 0 && session) {
        const answerValues = [];
        for (const q of adQuestions) {
          if (q.questionType === "rating") {
            // Mostly positive ratings (3-5), weighted toward 4-5
            const ratings = [3, 4, 4, 4, 5, 5, 5, 5];
            answerValues.push({
              reviewSessionId: session.id,
              questionId: q.id,
              answerValue: String(ratings[Math.floor(Math.random() * ratings.length)]),
              answerText: null,
            });
          } else if (q.questionType === "yes_no") {
            // 75% yes
            answerValues.push({
              reviewSessionId: session.id,
              questionId: q.id,
              answerValue: Math.random() < 0.75 ? "Yes" : "No",
              answerText: null,
            });
          } else if (q.questionType === "multiple_choice") {
            const opts = q.options ?? ["Option A", "Option B"];
            answerValues.push({
              reviewSessionId: session.id,
              questionId: q.id,
              answerValue: opts[Math.floor(Math.random() * opts.length)] ?? opts[0],
              answerText: null,
            });
          } else if (q.questionType === "emoji") {
            const opts = q.options ?? ["😍", "👍"];
            answerValues.push({
              reviewSessionId: session.id,
              questionId: q.id,
              answerValue: opts[Math.floor(Math.random() * opts.length)] ?? opts[0],
              answerText: null,
            });
          } else if (q.questionType === "open_text") {
            answerValues.push({
              reviewSessionId: session.id,
              questionId: q.id,
              answerValue: null,
              answerText: DANGOTE_COMMENTS[(i + j + 10) % DANGOTE_COMMENTS.length] ?? "",
            });
          }
        }
        if (answerValues.length > 0) {
          await db.insert(answersTable).values(answerValues);
        }
      }

      // Points ledger
      if (session) {
        await db.insert(pointsLedgerTable).values({
          userId: reviewer.id,
          amount: pointsAwarded,
          source: "review",
          referenceId: session.id,
          description: `Completed review for "${ad.title}"`,
        });
      }

      sessionCount++;
    }
  }

  console.log(`✓ ${sessionCount} Dangote review sessions seeded with answers + comments`);
  console.log("✅ Dangote seed complete!");
  await pool.end();
}

seedDangote().catch((err) => {
  console.error("Dangote seed failed:", err);
  process.exit(1);
});
