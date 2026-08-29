/**
 * Canonical AdSpot table names on the shared Zonic Supabase project.
 * Never use MyYanga public.ads / profiles / brands (broken RLS / wrong schema).
 */
export const ADSPOT_PROFILES = "adspot_profiles";
export const ADSPOT_BRANDS = "adspot_brands";
export const ADSPOT_REVIEWER_PROFILES = "adspot_reviewer_profiles";
export const ADSPOT_ADS = "adspot_ads";
export const ADSPOT_QUESTIONS = "adspot_questions";
export const ADSPOT_REVIEW_SESSIONS = "adspot_review_sessions";
export const ADSPOT_POINTS_LEDGER = "adspot_points_ledger";
export const ADSPOT_REDEMPTIONS = "adspot_redemptions";
export const ADSPOT_PACKAGES = "adspot_packages";
export const ADSPOT_EVENTS_LOG = "adspot_events_log";
export const ADSPOT_PLATFORM_SETTINGS = "adspot_platform_settings";
export const ADSPOT_LEADERBOARD_SNAPSHOTS = "adspot_leaderboard_snapshots";

/** @deprecated Use ADSPOT_* constants — kept as aliases during migration. */
export const ADS = ADSPOT_ADS;
export const QUESTIONS = ADSPOT_QUESTIONS;
export const REVIEW_SESSIONS = ADSPOT_REVIEW_SESSIONS;
export const POINTS_LEDGER = ADSPOT_POINTS_LEDGER;
export const REDEMPTIONS = ADSPOT_REDEMPTIONS;
export const AD_PACKAGES = ADSPOT_PACKAGES;
export const EVENTS_LOG = ADSPOT_EVENTS_LOG;
export const PLATFORM_SETTINGS = ADSPOT_PLATFORM_SETTINGS;
export const LEADERBOARD_SNAPSHOTS = ADSPOT_LEADERBOARD_SNAPSHOTS;
