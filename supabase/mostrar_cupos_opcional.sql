-- Opción: crear y compartir invitaciones sin mostrar cupos.
-- Ejecutada en el proyecto Supabase conectado.
ALTER TABLE public.sisters_guests ADD COLUMN IF NOT EXISTS show_seats boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sisters_get_invite(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE g public.sisters_guests%rowtype; e public.sisters_events%rowtype; gr public.sisters_groups%rowtype;
BEGIN
 IF p_token IS NULL OR length(p_token)<>64 THEN RETURN NULL; END IF;
 SELECT * INTO g FROM public.sisters_guests WHERE share_token=p_token;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO e FROM public.sisters_events WHERE id=g.event_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF g.group_id IS NOT NULL THEN SELECT * INTO gr FROM public.sisters_groups WHERE id=g.group_id; END IF;
 RETURN jsonb_build_object('event',to_jsonb(e)-'owner_id'-'created_at',
  'guest',jsonb_build_object('id',g.id,'event_id',g.event_id,'group_id',g.group_id,
   'name',g.name,'seats',g.seats,'show_seats',g.show_seats,'share_token',g.share_token,'status',g.status,
   'attending_count',g.attending_count,'message',g.message,'sent',g.sent,
   'sent_at',g.sent_at,'created_at',g.created_at,'phone',''),
  'group_name',coalesce(gr.name,''),'track',coalesce(gr.track,'general'));
END; $$;
REVOKE ALL ON FUNCTION public.sisters_get_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.sisters_get_invite(text) TO anon,authenticated;
