-- Apply after 001_initial.sql. Live APIs require a private operator passkey.
-- No anonymous direct reads of prompts, simulations or conversations.
DROP POLICY IF EXISTS "Allow public read simulations" ON public.simulations;
DROP POLICY IF EXISTS "Allow public read mutations" ON public.mutations;
DROP POLICY IF EXISTS "Allow public read debates" ON public.debates;

CREATE TABLE IF NOT EXISTS public.iffy_generation_budget (
  bucket text PRIMARY KEY,
  used integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.iffy_generation_budget ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iffy_generation_budget FROM anon, authenticated;

-- One shared workspace: count every provider attempt, including retries/repairs.
-- The advisory transaction lock makes the minute and day checks atomic together.
CREATE OR REPLACE FUNCTION public.iffy_consume_generation_budget()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  minute_key text := 'minute:' || to_char(date_trunc('minute', now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI');
  day_key text := 'day:' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
BEGIN
  PERFORM pg_advisory_xact_lock(734608501);
  DELETE FROM public.iffy_generation_budget WHERE expires_at < now();
  IF COALESCE((SELECT used FROM public.iffy_generation_budget WHERE bucket = minute_key), 0) >= 6
    OR COALESCE((SELECT used FROM public.iffy_generation_budget WHERE bucket = day_key), 0) >= 50 THEN
    RETURN false;
  END IF;
  INSERT INTO public.iffy_generation_budget(bucket,used,expires_at)
    VALUES (minute_key,1,now()+interval '2 minutes'),(day_key,1,now()+interval '2 days')
    ON CONFLICT(bucket) DO UPDATE SET used=iffy_generation_budget.used+1;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.iffy_consume_generation_budget() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iffy_consume_generation_budget() TO service_role;
