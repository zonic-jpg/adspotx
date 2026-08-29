import { z } from "zod";
import { Request, Response, NextFunction } from "express";

function makeErrorResponse(error: z.ZodError) {
  return {
    error: "validation_error",
    message: "Invalid request",
    details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

export function validateBody<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json(makeErrorResponse(result.error));
      return;
    }
    req.body = result.data as typeof req.body;
    next();
  };
}

export function validateParams<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json(makeErrorResponse(result.error));
      return;
    }
    Object.assign(req.params, result.data);
    next();
  };
}

/**
 * Validates and transforms req.query using the given schema.
 * The parsed result is stored in res.locals.parsedQuery — read from there in handlers.
 * req.query is read-only in Express 5 and cannot be reassigned.
 */
export function validateQuery<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json(makeErrorResponse(result.error));
      return;
    }
    res.locals["parsedQuery"] = result.data;
    next();
  };
}

const positiveInt = (defaultVal: number, max: number) =>
  z
    .string()
    .optional()
    .default(String(defaultVal))
    .refine((v) => /^\d+$/.test(v), { message: "must be a non-negative integer" })
    .transform((v) => Math.min(Math.max(0, parseInt(v, 10)), max));

const offsetInt = z
  .string()
  .optional()
  .default("0")
  .refine((v) => /^\d+$/.test(v), { message: "must be a non-negative integer" })
  .transform((v) => Math.max(0, parseInt(v, 10)));

export const paramSchemas = {
  adId:         z.object({ adId: z.string().uuid("adId must be a valid UUID") }),
  sessionId:    z.object({ sessionId: z.string().uuid("sessionId must be a valid UUID") }),
  questionId:   z.object({ questionId: z.string().uuid("questionId must be a valid UUID") }),
  brandId:      z.object({ brandId: z.string().uuid("brandId must be a valid UUID") }),
  redemptionId: z.object({ id: z.string().uuid("id must be a valid UUID") }),
  sessionIdAdmin: z.object({ id: z.string().uuid("id must be a valid UUID") }),
};

export const querySchemas = {
  adFeed: z.object({
    limit: positiveInt(10, 50),
    offset: offsetInt,
  }),

  pointsLedger: z.object({
    limit: positiveInt(20, 100),
    offset: offsetInt,
  }),

  adminEvents: z.object({
    limit: positiveInt(50, 200),
    offset: offsetInt,
    eventType: z.string().optional(),
    actorId: z.string().uuid().optional(),
    from: z
      .string()
      .optional()
      .refine((v) => !v || !isNaN(Date.parse(v)), { message: "from must be a valid ISO date" }),
    to: z
      .string()
      .optional()
      .refine((v) => !v || !isNaN(Date.parse(v)), { message: "to must be a valid ISO date" }),
  }),

  adminEventsExport: z.object({
    eventType: z.string().optional(),
    from: z
      .string()
      .optional()
      .refine((v) => !v || !isNaN(Date.parse(v)), { message: "from must be a valid ISO date" }),
    to: z
      .string()
      .optional()
      .refine((v) => !v || !isNaN(Date.parse(v)), { message: "to must be a valid ISO date" }),
  }),

  adminAds: z.object({
    limit: positiveInt(50, 200),
    offset: offsetInt,
    status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  }),

  adminUsers: z.object({
    limit: positiveInt(50, 200),
    offset: offsetInt,
    role: z.enum(["reviewer", "brand", "admin", "super_admin"]).optional(),
  }),

  adminBrands: z.object({
    limit: positiveInt(50, 200),
    offset: offsetInt,
  }),

  adminPoints: z.object({
    limit: positiveInt(50, 200),
    offset: offsetInt,
    userId: z.string().uuid().optional(),
  }),

  adminRedemptions: z.object({
    limit: positiveInt(50, 200),
    offset: offsetInt,
    status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  }),

  adminSessions: z.object({
    limit: positiveInt(50, 200),
    offset: offsetInt,
    status: z.enum(["in_progress", "completed", "abandoned"]).optional(),
    userId: z.string().uuid().optional(),
  }),

  leaderboardHistory: z.object({
    weeks: positiveInt(4, 12),
  }),
};

export const schemas = {
  register: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    username: z.string().min(2).max(50),
    role: z.enum(["reviewer", "brand"]),
    companyName: z.string().max(200).optional(),
  }),

  login: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),

  startReview: z.object({
    adId: z.string().uuid(),
  }),

  completeReview: z.object({
    watchSeconds: z.number().int().min(0),
    answers: z.array(
      z.object({
        questionId: z.string().uuid(),
        answerText: z.string().max(2000).optional(),
        answerValue: z.string().max(500).optional(),
      })
    ),
    comment: z.string().max(300).optional(),
    proverbAnswer: z.string().max(500).optional(),
  }),

  createAd: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    assetUrl: z.string().url(),
    assetType: z.enum(["image", "video", "youtube", "vimeo"]).optional(),
    minWatchSeconds: z.number().int().min(1).max(300).optional(),
    pointReward: z.number().int().min(1).max(1000).optional(),
    proverbQuestion: z.string().max(500).optional(),
    proverbAnswer: z.string().max(200).optional(),
    proverbBonusPoints: z.number().int().min(0).max(100).optional(),
    questions: z
      .array(
        z.object({
          questionType: z.enum(["multiple_choice", "rating", "open_text", "emoji", "yes_no"]),
          questionText: z.string().min(1).max(500),
          sortOrder: z.number().int().min(0).optional(),
          options: z.array(z.string().max(200)).optional(),
        })
      )
      .max(10)
      .optional(),
  }),

  updateAd: z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    status: z.enum(["draft", "active", "paused", "archived"]).optional(),
    minWatchSeconds: z.number().int().min(1).max(300).optional(),
    pointReward: z.number().int().min(1).max(1000).optional(),
  }),

  addQuestion: z.object({
    questionType: z.enum(["multiple_choice", "rating", "open_text", "emoji", "yes_no"]),
    questionText: z.string().min(1).max(500),
    sortOrder: z.number().int().min(0).optional(),
    options: z.array(z.string().max(200)).optional(),
  }),
};
