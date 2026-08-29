-- AdSpot — migration: fraud, notifications, gifts, referrals, device signals.
-- Adds the missing-feature tables on top of the existing schema. Idempotent-ish:
-- uses IF NOT EXISTS where supported. Run after adspot_db.sql.

-- ── enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE public.fraud_flag_status AS ENUM ('open','reviewing','dismissed','actioned'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.notification_type AS ENUM ('reward','gift','redemption','referral','fraud','campaign','system'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.gift_type AS ENUM ('discount','cash','airtime','points','voucher','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.gift_grant_status AS ENUM ('granted','redeemed','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.referral_status AS ENUM ('pending','signed_up','qualified','rewarded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── users: suspension flag ────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;

-- ── review_sessions: server-side fraud signals + watch percentage ─────────
ALTER TABLE public.review_sessions ADD COLUMN IF NOT EXISTS watch_percentage integer;
ALTER TABLE public.review_sessions ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.review_sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE public.review_sessions ADD COLUMN IF NOT EXISTS device_fingerprint text;

-- ── fraud ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score integer NOT NULL,
  reason text NOT NULL,
  details jsonb,
  status public.fraud_flag_status NOT NULL DEFAULT 'open',
  reviewed_by uuid REFERENCES public.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fraud_flags_user ON public.fraud_flags(user_id, status);

CREATE TABLE IF NOT EXISTS public.fraud_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  same_device_score integer NOT NULL DEFAULT 50,
  same_ip_score integer NOT NULL DEFAULT 20,
  excessive_daily_score integer NOT NULL DEFAULT 30,
  suspicious_pattern_score integer NOT NULL DEFAULT 50,
  warn_threshold integer NOT NULL DEFAULT 50,
  review_threshold integer NOT NULL DEFAULT 100,
  auto_suspend_threshold integer NOT NULL DEFAULT 150,
  max_daily_earnings integer NOT NULL DEFAULT 500,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.device_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  review_session_id uuid,
  ip_address text,
  user_agent text,
  device_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_signals_fp ON public.device_signals(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_device_signals_ip ON public.device_signals(ip_address);

-- ── notifications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL DEFAULT 'system',
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read, created_at DESC);

-- ── gifts (generic random reward) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.gift_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid REFERENCES public.ads(id) ON DELETE CASCADE,
  type public.gift_type NOT NULL,
  label text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  meta jsonb,
  weight integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gift_catalog_pool ON public.gift_catalog(active, ad_id);

CREATE TABLE IF NOT EXISTS public.gift_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES public.gift_catalog(id),
  review_session_id uuid,
  type public.gift_type NOT NULL,
  label text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  status public.gift_grant_status NOT NULL DEFAULT 'granted',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gift_grants_user ON public.gift_grants(user_id, created_at DESC);

-- ── referrals (refer & earn, invite outside the orbit) ────────────────────
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invitee_email text,
  invitee_user_id uuid REFERENCES public.users(id),
  channel text,
  status public.referral_status NOT NULL DEFAULT 'pending',
  reward_points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_referral_invitee ON public.referrals(referrer_id, invitee_user_id);

-- seed one fraud_rules row if none exists
INSERT INTO public.fraud_rules (id) SELECT gen_random_uuid() WHERE NOT EXISTS (SELECT 1 FROM public.fraud_rules);
