ALTER TABLE public.game_invites ADD COLUMN IF NOT EXISTS snoozed_at timestamptz;

CREATE OR REPLACE FUNCTION public.protect_match_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.winner_id IS DISTINCT FROM OLD.winner_id
      OR NEW.settled_at IS DISTINCT FROM OLD.settled_at
      OR NEW.finished_at IS DISTINCT FROM OLD.finished_at
      OR NEW.status IS DISTINCT FROM OLD.status
      OR NEW.rating_delta_host IS DISTINCT FROM OLD.rating_delta_host
      OR NEW.rating_delta_guest IS DISTINCT FROM OLD.rating_delta_guest
      OR NEW.host_id IS DISTINCT FROM OLD.host_id
      OR NEW.guest_id IS DISTINCT FROM OLD.guest_id
      OR NEW.code IS DISTINCT FROM OLD.code)
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'match outcome columns can only be written by secured server functions';
  END IF;
  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';