-- AdSpot Network Partner Program — partner portal tables.
-- Idempotent: safe to run multiple times. Run after adspot_db.sql.

CREATE TABLE IF NOT EXISTS public.network_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  outlet_type text NOT NULL DEFAULT 'newspaper',
  website text,
  contact_email text,
  region text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL UNIQUE REFERENCES public.network_partners(id) ON DELETE CASCADE,
  adspot_linked boolean NOT NULL DEFAULT false,
  api_key text,
  webhook_url text,
  embed_config jsonb,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_integrations_linked
  ON public.partner_integrations (adspot_linked)
  WHERE adspot_linked = true;
