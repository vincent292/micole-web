-- Replay-safe atomic enrollment. Request identifiers are generated once by the client.
-- Keep only a fingerprint, never a second copy of pupil/health data.
create table aulanexo_private.enrollment_requests (
 student_id uuid primary key references public.students(id),school_id uuid not null references public.schools(id),
 actor_id uuid not null references auth.users(id),fingerprint bytea not null,created_at timestamptz not null default now()
);
alter table aulanexo_private.enrollment_requests enable row level security;
revoke all on aulanexo_private.enrollment_requests from public,anon,authenticated,service_role;
alter function public.enroll_student_with_plan(jsonb,jsonb) rename to enroll_student_with_plan_once;
alter function public.enroll_student_with_plan_once(jsonb,jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.enroll_student_with_plan_once(jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.enroll_student_with_plan(p_student jsonb,p_plan jsonb) returns void language plpgsql security definer set search_path='' as $$
declare school uuid:=(p_student->>'school_id')::uuid;child uuid:=(p_student->>'id')::uuid;receipt aulanexo_private.enrollment_requests;fingerprint bytea;begin
 if auth.uid() is null or not aulanexo_private.in_support_school(school) or not public.has_school_role(school,array['director']) or not public.platform_school_enabled(school) then raise exception 'Solo Dirección de esta institución puede inscribir estudiantes.';end if;
 if child is null or (p_plan->>'id') is null or child is distinct from (p_plan->>'student_id')::uuid or school is distinct from (p_plan->>'school_id')::uuid then raise exception 'El plan debe corresponder al estudiante inscrito.';end if;
 fingerprint:=sha256(convert_to(jsonb_build_array(p_student,p_plan)::text,'UTF8'));
 perform pg_advisory_xact_lock(hashtext('enrollment-'||child::text));
 select * into receipt from aulanexo_private.enrollment_requests where student_id=child;
 if found then
  if receipt.school_id is distinct from school or receipt.actor_id is distinct from auth.uid() or receipt.fingerprint is distinct from fingerprint then raise exception 'Esta inscripción ya fue procesada con otros datos. Revisa el expediente antes de crear una nueva.';end if;
  return;
 end if;
 perform aulanexo_private.enroll_student_with_plan_once(p_student,p_plan);
 insert into aulanexo_private.enrollment_requests(student_id,school_id,actor_id,fingerprint) values(child,school,auth.uid(),fingerprint);
end $$;
revoke all on function public.enroll_student_with_plan(jsonb,jsonb) from public,anon;
grant execute on function public.enroll_student_with_plan(jsonb,jsonb) to authenticated;
