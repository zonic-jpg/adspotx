import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { isProfileComplete, missingProfileFields, profileCompleteness } from "../lib/profile";
import { usersTable, brandsTable, reviewerProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { signToken, requireAuth } from "../middlewares/auth";
import { validateBody, schemas } from "../middlewares/validate";
import { logEvent, EVENT_TYPES } from "../lib/events";
import { respondIfDatabaseUnavailable } from "../lib/handle-db-error";
import { adminMemoryEnabled, getMockUserById, tryMockLogin } from "../lib/admin-memory-store";

const router = Router();

router.post("/auth/register", validateBody(schemas.register), async (req, res) => {
  try {
    const { email: rawEmail, password, username, role, companyName } = req.body;
    const email = rawEmail.toLowerCase().trim();

    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "conflict", message: "Email already registered" });
      return;
    }

    const existingUsername = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
    if (existingUsername.length > 0) {
      res.status(409).json({ error: "conflict", message: "Username already taken" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await db.transaction(async (tx) => {
      const [newUser] = await tx.insert(usersTable).values({ email, passwordHash, username, role }).returning();

      if (role === "brand") {
        await tx.insert(brandsTable).values({ userId: newUser.id, companyName: companyName?.trim() || username });
      }

      await logEvent({ eventType: EVENT_TYPES.USER_REGISTER, actorId: newUser.id, entityType: "user", entityId: newUser.id, metadata: { role, email } }, tx);

      return newUser;
    });

    const token = signToken({ userId: user.id, email: user.email, username: user.username, role: user.role });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, username: user.username, role: user.role, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error(err);
    if (respondIfDatabaseUnavailable(res, err, "Registration failed")) return;
    res.status(500).json({ error: "internal_error", message: "Registration failed" });
  }
});

router.post("/auth/login", validateBody(schemas.login), async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body;
    const email = rawEmail.toLowerCase().trim();

    const mockUser = tryMockLogin(email, password);
    if (mockUser) {
      const token = signToken({
        userId: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role,
      });
      res.json({
        token,
        user: {
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          role: mockUser.role,
          createdAt: mockUser.createdAt,
        },
      });
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

    if (!user) { res.status(401).json({ error: "unauthorized", message: "Invalid credentials" }); return; }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) { res.status(401).json({ error: "unauthorized", message: "Invalid credentials" }); return; }

    await logEvent({ eventType: EVENT_TYPES.USER_LOGIN, actorId: user.id, entityType: "user", entityId: user.id, metadata: { role: user.role } });

    const token = signToken({ userId: user.id, email: user.email, username: user.username, role: user.role });

    res.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role, createdAt: user.createdAt } });
  } catch (err) {
    console.error(err);
    if (respondIfDatabaseUnavailable(res, err, "Login failed")) return;
    res.status(500).json({ error: "internal_error", message: "Login failed" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    if (adminMemoryEnabled()) {
      const mockUser = getMockUserById(req.user!.userId);
      if (mockUser) {
        res.json({
          id: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          role: mockUser.role,
          createdAt: mockUser.createdAt,
          profile: null,
        });
        return;
      }
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ error: "not_found", message: "User not found" }); return; }

    await logEvent({ eventType: EVENT_TYPES.PROFILE_VIEWED, actorId: user.id, entityType: "user", entityId: user.id, metadata: { role: user.role } });

    let profile = null;
    if (user.role === "reviewer") {
      const [p] = await db.select().from(reviewerProfilesTable).where(eq(reviewerProfilesTable.userId, user.id)).limit(1);
      if (p) {
        profile = { gender: p.gender, ageBand: p.ageBand, state: p.state, employmentStatus: p.employmentStatus, educationLevel: p.educationLevel };
      }
    }

    res.json({ id: user.id, email: user.email, username: user.username, role: user.role, createdAt: user.createdAt, profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch profile" });
  }
});

// ─── GET /auth/profile ────────────────────────────────────────────────────────
router.get("/auth/profile", requireAuth, async (req, res) => {
  try {
    const [p] = await db.select().from(reviewerProfilesTable).where(eq(reviewerProfilesTable.userId, req.user!.userId)).limit(1);
    const profile = p ?? null;
    res.json({
      ...(profile ?? { userId: req.user!.userId }),
      profileComplete: isProfileComplete(profile),
      completenessPct: profileCompleteness(profile),
      missingFields: missingProfileFields(profile),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch profile" });
  }
});

// ─── PATCH /auth/profile ─────────────────────────────────────────────────────
router.patch("/auth/profile", requireAuth, async (req, res) => {
  try {
    const { gender, ageBand, state, employmentStatus, educationLevel, city, incomeBand, occupationSector, deviceType, maritalStatus, interests } = req.body;
    const userId = req.user!.userId;

    const updateData: Record<string, unknown> = {};
    if (gender !== undefined) updateData.gender = gender;
    if (ageBand !== undefined) updateData.ageBand = ageBand;
    if (state !== undefined) updateData.state = state;
    if (employmentStatus !== undefined) updateData.employmentStatus = employmentStatus;
    if (educationLevel !== undefined) updateData.educationLevel = educationLevel;
    if (city !== undefined) updateData.city = city;
    if (incomeBand !== undefined) updateData.incomeBand = incomeBand;
    if (occupationSector !== undefined) updateData.occupationSector = occupationSector;
    if (deviceType !== undefined) updateData.deviceType = deviceType;
    if (maritalStatus !== undefined) updateData.maritalStatus = maritalStatus;
    if (interests !== undefined && Array.isArray(interests)) updateData.interests = interests.slice(0, 12).map(String);

    const [existing] = await db.select({ id: reviewerProfilesTable.id }).from(reviewerProfilesTable).where(eq(reviewerProfilesTable.userId, userId)).limit(1);

    let result;
    if (existing) {
      const [updated] = await db.update(reviewerProfilesTable)
        .set({ ...updateData, updatedAt: new Date() } as Partial<typeof reviewerProfilesTable.$inferInsert>)
        .where(eq(reviewerProfilesTable.userId, userId))
        .returning();
      result = updated;
    } else {
      const [inserted] = await db.insert(reviewerProfilesTable)
        .values({ userId, ...updateData } as typeof reviewerProfilesTable.$inferInsert)
        .returning();
      result = inserted;
    }

    res.json({
      ...result,
      profileComplete: isProfileComplete(result),
      completenessPct: profileCompleteness(result),
      missingFields: missingProfileFields(result),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update profile" });
  }
});

export default router;
