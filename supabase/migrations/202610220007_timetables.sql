-- Timetables are drafts until a separately authorized publication. No client DML.
create table public.timetable_delegates (
 school_id uuid not null references public.schools(id),email text not null check(email=lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 can_approve boolean not null default false,active boolean not null default true,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),primary key(school_id,email)
);
create table public.timetable_versions (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),year_id uuid not null,
 name text not null check(length(trim(name)) between 2 and 100),status text not null default 'draft' check(status in ('draft','published','archived')),
 revision integer not null default 1,config jsonb not null,lessons jsonb not null default '[]',created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),published_by uuid references auth.users(id),published_at timestamptz,
 foreign key(year_id,school_id) references public.academic_years(id,school_id),check(jsonb_typeof(config)='object'),check(jsonb_typeof(lessons)='array')
);
create unique index timetable_one_published on public.timetable_versions(year_id) where status='published';
create function aulanexo_private.can_plan(p_school uuid,p_approve boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select not public.is_platform_admin() and aulanexo_private.in_support_school(p_school) and exists(select 1 from public.schools where id=p_school and status='active') and public.platform_school_enabled(p_school) and
 (public.school_director(p_school) or (aulanexo_private.support_id() is null and exists(select 1 from public.timetable_delegates d join auth.users u on u.id=auth.uid() and lower(u.email)=d.email and u.email_confirmed_at is not null where d.school_id=p_school and d.active and (not p_approve or d.can_approve))));
$$;
create policy planner_school_read on public.schools for select to authenticated using(aulanexo_private.can_plan(id));
create function public.save_timetable_delegate(p_school_id uuid,p_email text,p_active boolean,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.school_director(p_school_id) then raise exception 'Solo Dirección asigna Secretaría académica.';end if;
 if p_active is null or p_approve is null then raise exception 'Indica el acceso y permiso de publicación.';end if;
 if exists(select 1 from aulanexo_private.persisted_test_accounts where email=lower(trim(p_email)) and school_id<>p_school_id) then raise exception 'Una cuenta de pruebas no puede acceder a otra institución.';end if;
 insert into public.timetable_delegates(school_id,email,can_approve,active,updated_by) values(p_school_id,lower(trim(p_email)),p_approve,p_active,aulanexo_private.actor_uid())
 on conflict(school_id,email) do update set can_approve=excluded.can_approve,active=excluded.active,updated_by=excluded.updated_by,updated_at=now();
end $$;
do $$begin execute replace(pg_get_functiondef('public.workspace_identity()'::regprocedure),'FUNCTION public.workspace_identity(','FUNCTION aulanexo_private.identity_without_scheduler(');end $$;
revoke all on function aulanexo_private.identity_without_scheduler() from public,anon,authenticated,service_role;
create or replace function public.workspace_identity() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=aulanexo_private.identity_without_scheduler();members jsonb;begin
 if aulanexo_private.support_id() is not null or public.is_platform_admin() or result->'roles' ? 'student' then return result;end if;
 select jsonb_agg(jsonb_build_object('schoolId',d.school_id,'role','scheduler')) into members from public.timetable_delegates d join auth.users u on u.id=auth.uid() and lower(u.email)=d.email and u.email_confirmed_at is not null join public.schools s on s.id=d.school_id and s.status='active' where d.active;
 if members is not null then result:=result||jsonb_build_object('roles',(result->'roles')||jsonb_build_array('scheduler'),'memberships',(result->'memberships')||members);end if;
 return result;
end $$;
create function aulanexo_private.schedule_room_visible(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.classrooms r where r.id=p_room and not public.is_platform_admin() and aulanexo_private.in_support_school(r.school_id) and public.platform_school_enabled(r.school_id) and
 (aulanexo_private.can_plan(r.school_id) or public.may_edit_classroom(r.school_id,r.id) or exists(select 1 from public.students s where s.classroom_id=r.id and ((public.family_access(s.id) and aulanexo_private.financial_learning_access(s.id)) or (s.id=aulanexo_private.student_id_for_user(aulanexo_private.actor_uid(),r.school_id) and aulanexo_private.student_learning_access(s.id))))));
$$;
-- Mirror the solver's hard constraints in PostgreSQL. Never trust a client "solved" flag.
create function aulanexo_private.validate_timetable(p_year uuid,c jsonb,entries jsonb,p_complete boolean) returns void language plpgsql security definer set search_path='' as $$
declare y public.academic_years;v jsonb;b jsonb;x jsonb;l jsonb;d integer;s integer;e integer;period integer;slots jsonb:='[]';step_value integer;blocks integer;required_count integer;
begin
 select * into y from public.academic_years where id=p_year;
 if y.id is null or y.status<>'open' then raise exception 'Selecciona una gestión abierta.';end if;
 if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'days') is distinct from 'array' or jsonb_typeof(c->'breaks') is distinct from 'array' or jsonb_typeof(c->'loads') is distinct from 'array' or jsonb_typeof(c->'unavailable') is distinct from 'array' or jsonb_typeof(entries) is distinct from 'array' then raise exception 'La configuración del horario está incompleta.';end if;
 if length(c::text)>500000 or jsonb_array_length(entries)>10000 or jsonb_array_length(c->'loads')>500 then raise exception 'El horario supera el límite de tamaño.';end if;
 s:=(c->>'start')::integer;e:=(c->>'end')::integer;period:=(c->>'periodMinutes')::integer;
 if s is null or e is null or period is null or s<0 or e>1440 or s>=e or period not between 10 and 180 or jsonb_array_length(c->'days') not between 1 and 7 or exists(select 1 from jsonb_array_elements_text(c->'days') z where z::integer not between 1 and 7) or (select count(distinct z) from jsonb_array_elements(c->'days') z)<>jsonb_array_length(c->'days') then raise exception 'Revisa los días, jornada y duración del periodo.';end if;
 for b in select value from jsonb_array_elements(c->'breaks') loop
  if (b->>'start') is null or (b->>'end') is null or (b->>'start')::integer<s or (b->>'end')::integer>e or (b->>'end')::integer<=(b->>'start')::integer then raise exception 'Revisa los recreos.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(c->'breaks') with ordinality a(v,n) join jsonb_array_elements(c->'breaks') with ordinality b(v,n) on a.n<b.n and (a.v->>'start')::int<(b.v->>'end')::int and (b.v->>'start')::int<(a.v->>'end')::int) then raise exception 'Los recreos se cruzan.';end if;
 for d in select value::integer from jsonb_array_elements_text(c->'days') loop
  step_value:=s;
  while step_value+period<=e loop
   select value into b from jsonb_array_elements(c->'breaks') where step_value<(value->>'end')::int and step_value+period>(value->>'start')::int limit 1;
   if b is not null then step_value:=(b->>'end')::int;else slots:=slots||jsonb_build_array(jsonb_build_object('day',d,'start',step_value));step_value:=step_value+period;end if;
  end loop;
 end loop;
 if (select count(distinct value->>'classSubjectId') from jsonb_array_elements(c->'loads'))<>jsonb_array_length(c->'loads') then raise exception 'Configura una carga por materia y paralelo.';end if;
 for l in select value from jsonb_array_elements(c->'loads') loop
  if not exists(select 1 from public.class_subjects cs join public.classrooms r on r.id=cs.classroom_id join public.subject_teachers st on st.class_subject_id=cs.id join public.teachers t on t.id=st.teacher_id where cs.id=(l->>'classSubjectId')::uuid and r.id=(l->>'classroomId')::uuid and r.school_id=y.school_id and r.academic_year=y.year and r.active and cs.active and t.id=(l->>'teacherId')::uuid and t.status='active') then raise exception 'Cada materia necesita un docente activo asignado a su paralelo en esta gestión.';end if;
  if (l->>'periods') is null or (l->>'blockSize') is null or (l->>'periods')::int not between 1 and 80 or (l->>'blockSize')::int not between 1 and 6 or (l->>'periods')::int%(l->>'blockSize')::int<>0 then raise exception 'Revisa los periodos semanales y bloques.';end if;
 end loop;
 for b in select value from jsonb_array_elements(c->'unavailable') loop
  if (b->>'day') is null or (b->>'start') is null or (b->>'end') is null or (b->>'day')::int not between 1 and 7 or (b->>'start')::int<0 or (b->>'end')::int>1440 or (b->>'start')::int>=(b->>'end')::int or not exists(select 1 from public.teachers where id=(b->>'teacherId')::uuid and school_id=y.school_id) then raise exception 'Revisa la indisponibilidad del docente.';end if;
 end loop;
 if not p_complete then return;end if;
 if jsonb_array_length(c->'loads')=0 then raise exception 'Configura las materias antes de generar.';end if;
 if exists(select 1 from public.class_subjects cs join public.classrooms r on r.id=cs.classroom_id where cs.active and r.active and r.school_id=y.school_id and r.academic_year=y.year and not exists(select 1 from jsonb_array_elements(c->'loads') configured_load where (configured_load->>'classSubjectId')::uuid=cs.id)) then raise exception 'Falta configurar la carga de alguna materia o paralelo de la gestión.';end if;
 for v in select value from jsonb_array_elements(entries) loop
  select value into l from jsonb_array_elements(c->'loads') where value->>'classSubjectId'=v->>'classSubjectId';
  if l is null or (v->>'classroomId') is distinct from (l->>'classroomId') or (v->>'teacherId') is distinct from (l->>'teacherId') then raise exception 'Una clase no corresponde a su materia, aula o docente.';end if;
  d:=(v->>'day')::int;s:=(v->>'start')::int;e:=(v->>'end')::int;blocks:=(l->>'blockSize')::int;
  if d is null or s is null or e is null or e-s<>period*blocks then raise exception 'Revisa la duración de la clase.';end if;
  for step_value in 0..blocks-1 loop
   if not exists(select 1 from jsonb_array_elements(slots) z where (z->>'day')::int=d and (z->>'start')::int=s+step_value*period) then raise exception 'Una clase sale de la jornada o cruza un recreo.';end if;
  end loop;
  if exists(select 1 from jsonb_array_elements(c->'unavailable') z where z->>'teacherId'=v->>'teacherId' and (z->>'day')::int=d and (z->>'start')::int<e and (z->>'end')::int>s) then raise exception 'El docente no está disponible en una clase.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(entries) with ordinality a(v,n) join jsonb_array_elements(entries) with ordinality b(v,n) on a.n<b.n and a.v->>'day'=b.v->>'day' and (a.v->>'start')::int<(b.v->>'end')::int and (b.v->>'start')::int<(a.v->>'end')::int and (a.v->>'teacherId'=b.v->>'teacherId' or a.v->>'classroomId'=b.v->>'classroomId')) then raise exception 'Hay un cruce de docente o aula.';end if;
 for l in select value from jsonb_array_elements(c->'loads') loop
  select coalesce(sum(((value->>'end')::int-(value->>'start')::int)/period),0) into required_count from jsonb_array_elements(entries) where value->>'classSubjectId'=l->>'classSubjectId';
  if required_count<>(l->>'periods')::int then raise exception 'La carga semanal de una materia está incompleta.';end if;
 end loop;
end $$;
create function public.save_timetable(p_version jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare y public.academic_years;oldrow public.timetable_versions;target uuid:=coalesce(nullif(p_version->>'id','')::uuid,gen_random_uuid());begin
 select * into y from public.academic_years where id=(p_version->>'year_id')::uuid;
 if not aulanexo_private.can_plan(y.school_id) then raise exception 'Solo Dirección o Secretaría académica prepara horarios.';end if;
 perform pg_advisory_xact_lock(hashtext('school-timetables'),hashtext(y.school_id::text));
 select * into oldrow from public.timetable_versions where id=target for update;
 if oldrow.id is not null and (oldrow.school_id<>y.school_id or oldrow.year_id<>y.id or oldrow.status<>'draft' or oldrow.revision is distinct from (p_version->>'revision')::int) then raise exception 'El borrador cambió o está publicado. Carga la versión actual o crea una copia.';end if;
 perform aulanexo_private.validate_timetable(y.id,p_version->'config',coalesce(p_version->'lessons','[]'),jsonb_array_length(coalesce(p_version->'lessons','[]'))>0);
 insert into public.timetable_versions(id,school_id,year_id,name,config,lessons,created_by) values(target,y.school_id,y.id,trim(p_version->>'name'),p_version->'config',coalesce(p_version->'lessons','[]'),aulanexo_private.actor_uid())
 on conflict(id) do update set name=excluded.name,config=excluded.config,lessons=excluded.lessons,revision=public.timetable_versions.revision+1;
 return target;
end $$;
create function public.publish_timetable(p_id uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare v public.timetable_versions;y public.academic_years;begin
 select * into v from public.timetable_versions where id=p_id;
 if v.id is null or not aulanexo_private.can_plan(v.school_id,true) then raise exception 'Solo Dirección o Secretaría autorizada puede publicar.';end if;
 -- Global year lock serializes publications across sites sharing a teacher identity.
 select * into y from public.academic_years where id=v.year_id;
 perform pg_advisory_xact_lock(hashtext('publish-timetables'),y.year);
 select * into v from public.timetable_versions where id=p_id for update;
 if v.status='published' and v.revision=p_revision then return;end if;
 if v.status<>'draft' or v.revision is distinct from p_revision then raise exception 'El borrador cambió. Revísalo antes de aprobar.';end if;
 perform aulanexo_private.validate_timetable(v.year_id,v.config,v.lessons,true);
 if exists(select 1 from jsonb_array_elements(v.lessons) n join public.teachers nt on nt.id=(n->>'teacherId')::uuid join public.timetable_versions o on o.status='published' and o.school_id<>v.school_id join public.academic_years oy on oy.id=o.year_id and oy.year=y.year and oy.starts_on<=y.ends_on and oy.ends_on>=y.starts_on cross join lateral jsonb_array_elements(o.lessons) l join public.teachers ot on ot.id=(l->>'teacherId')::uuid where (nt.user_id is not null and nt.user_id=ot.user_id or lower(nt.email)=lower(ot.email)) and n->>'day'=l->>'day' and (n->>'start')::int<(l->>'end')::int and (l->>'start')::int<(n->>'end')::int) then raise exception 'El docente tiene una clase publicada en otra sede o institución en ese horario.';end if;
 update public.timetable_versions set status='archived',revision=revision+1 where year_id=v.year_id and status='published';
 update public.timetable_versions set status='published',published_by=aulanexo_private.actor_uid(),published_at=now(),revision=revision+1 where id=v.id;
end $$;
create function public.timetable_workspace(p_school_id uuid,p_year_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean:=aulanexo_private.can_plan(p_school_id);rids uuid[];yid uuid;year_value integer;begin
 if auth.uid() is null or public.is_platform_admin() or not aulanexo_private.in_support_school(p_school_id) or not public.platform_school_enabled(p_school_id) then raise exception 'No tienes acceso a los horarios.';end if;
 if p_year_id is null then select id,year into yid,year_value from public.academic_years where school_id=p_school_id order by year desc limit 1;
 else select id,year into yid,year_value from public.academic_years where id=p_year_id and school_id=p_school_id;end if;
 select array_agg(id) into rids from public.classrooms where school_id=p_school_id and academic_year=year_value and (manager or aulanexo_private.schedule_room_visible(id));
 if not manager and coalesce(cardinality(rids),0)=0 then raise exception 'No tienes acceso a los horarios de esta gestión.';end if;
 return jsonb_build_object('canManage',manager,'canApprove',aulanexo_private.can_plan(p_school_id,true),'canDelegate',public.school_director(p_school_id),
 'years',coalesce((select jsonb_agg(to_jsonb(y) order by year desc) from public.academic_years y where school_id=p_school_id and (manager or exists(select 1 from public.classrooms r where r.school_id=p_school_id and r.academic_year=y.year and aulanexo_private.schedule_room_visible(r.id)))),'[]'),
 'rooms',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'academic_year',academic_year) order by name) from public.classrooms where id=any(rids)),'[]'),
 'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',cs.id,'classroomId',cs.classroom_id,'name',ss.name,'teacherIds',coalesce((select jsonb_agg(st.teacher_id) from public.subject_teachers st where st.class_subject_id=cs.id),'[]')) order by ss.name) from public.class_subjects cs join public.school_subjects ss on ss.id=cs.subject_id where cs.classroom_id=any(rids) and cs.active),'[]'),
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name) from public.teachers t where t.school_id=p_school_id and t.status='active' and (manager or exists(select 1 from public.teacher_classrooms tc where tc.teacher_id=t.id and tc.classroom_id=any(rids)))),'[]'),
 'versions',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('config',case when manager then v.config else v.config-'unavailable'-'loads' end,'lessons',case when manager then v.lessons else coalesce((select jsonb_agg(l) from jsonb_array_elements(v.lessons) l where (l->>'classroomId')::uuid=any(rids)),'[]') end) order by created_at desc) from public.timetable_versions v where v.year_id=yid and (manager or v.status='published')),'[]'),
 'delegates',case when public.school_director(p_school_id) then coalesce((select jsonb_agg(to_jsonb(d)-'updated_by') from public.timetable_delegates d where d.school_id=p_school_id),'[]') else '[]'::jsonb end,
 'externalBusy',case when manager then coalesce((select jsonb_agg(jsonb_build_object('teacherId',nt.id,'day',l->'day','start',l->'start','end',l->'end')) from public.teachers nt join public.teachers ot on nt.school_id=p_school_id and ot.school_id<>p_school_id and (nt.user_id is not null and nt.user_id=ot.user_id or lower(nt.email)=lower(ot.email)) join public.timetable_versions v on v.school_id=ot.school_id and v.status='published' join public.academic_years y on y.id=v.year_id and y.year=year_value cross join lateral jsonb_array_elements(v.lessons) l where (l->>'teacherId')::uuid=ot.id),'[]') else '[]'::jsonb end);
end $$;
do $$declare tab text;begin foreach tab in array array['timetable_delegates','timetable_versions'] loop
 execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);execute format('grant select on public.%I to authenticated',tab);
 execute format('create policy planning_read on public.%I for select to authenticated using(aulanexo_private.can_plan(school_id))',tab);
 execute format('create trigger planning_signal after insert or update or delete on public.%I for each row execute function aulanexo_private.touch_workspace()',tab);
 execute format('create trigger planning_audit after insert or update or delete on public.%I for each row execute function aulanexo_private.capture_audit()',tab);
end loop;end $$;
revoke all on function aulanexo_private.can_plan(uuid,boolean),aulanexo_private.schedule_room_visible(uuid),aulanexo_private.validate_timetable(uuid,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function aulanexo_private.can_plan(uuid,boolean) to authenticated;
revoke all on function public.save_timetable_delegate(uuid,text,boolean,boolean),public.save_timetable(jsonb),public.publish_timetable(uuid,integer),public.timetable_workspace(uuid,uuid) from public,anon;
grant execute on function public.save_timetable_delegate(uuid,text,boolean,boolean),public.save_timetable(jsonb),public.publish_timetable(uuid,integer),public.timetable_workspace(uuid,uuid) to authenticated;

create policy planner_signal on public.workspace_signals for select to authenticated using(aulanexo_private.can_plan(school_id));
