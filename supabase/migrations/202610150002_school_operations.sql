-- Instituciones, aulas, inscripción con plan y solicitudes académicas aprobadas.
create function aulanexo_private.valid_institution_https(p_url text) returns boolean language sql immutable set search_path='' as $$
 select length(p_url)<=2048 and p_url ~* '^https://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?([/?#][^[:space:]<>"'']*)?$' and p_url !~* '\.svg([?#]|$)';
$$;
revoke all on function aulanexo_private.valid_institution_https(text) from public,anon,authenticated;
alter table public.schools add column banner_url text not null default '', add column maps_url text not null default '';
create table aulanexo_private.school_contacts (
 school_id uuid primary key references public.schools(id) on delete cascade,
 director_identity text not null default '', director_phone text not null default ''
);
revoke all on aulanexo_private.school_contacts from public,anon,authenticated;

create function public.institution_private_contact(p_school_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not(public.is_platform_admin() or public.has_school_role(p_school_id,array['director'])) then raise exception 'Solo Dirección puede consultar estos datos.'; end if;
 return coalesce((select jsonb_build_object('directorIdentity',director_identity,'directorPhone',director_phone) from aulanexo_private.school_contacts where school_id=p_school_id),jsonb_build_object('directorIdentity','','directorPhone',''));
end $$;
alter function public.save_school(jsonb) rename to save_school_identity;
alter function public.save_school_identity(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.save_school_identity(jsonb) from public,anon,authenticated;
create function public.save_school(p_school jsonb) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid; banner text; map text; ci text; phone text; begin
 -- La función anterior verifica primero el permiso y conserva los campos omitidos.
 perform aulanexo_private.save_school_identity(p_school);
 sid:=(p_school->>'id')::uuid;
 banner:=coalesce(p_school->>'banner_url',(select banner_url from public.schools where id=sid));
 map:=coalesce(p_school->>'maps_url',(select maps_url from public.schools where id=sid));
 if banner<>'' and not (aulanexo_private.valid_institution_https(banner) or (length(banner)<=530000 and banner ~ '^data:image/webp;base64,UklGR[A-Za-z0-9+/=]+$')) then raise exception 'El banner debe ser WebP optimizado o una URL HTTPS.'; end if;
 if map<>'' and (length(map)>4096 or map !~ '^https://(www\.google\.com/maps(/|\?)|maps\.google\.com(/|\?)|maps\.app\.goo\.gl/)[^[:space:]<>"'']+$') then raise exception 'Usa un enlace válido de Google Maps.'; end if;
 ci:=upper(trim(p_school->>'director_identity')); phone:=trim(p_school->>'director_phone');
 if ci is not null and (length(ci)>40 or (ci<>'' and ci !~ '^[A-Z0-9 .-]{3,40}$')) then raise exception 'Revisa el carnet de Dirección.'; end if;
 if phone is not null and (length(phone)>25 or (phone<>'' and phone !~ '^\+?[0-9 ()-]{6,25}$')) then raise exception 'Revisa el celular de Dirección.'; end if;
 update public.schools set banner_url=banner,maps_url=map where id=sid;
 if p_school ? 'director_identity' or p_school ? 'director_phone' then
  insert into aulanexo_private.school_contacts(school_id,director_identity,director_phone) values(sid,coalesce(ci,''),coalesce(phone,''))
  on conflict(school_id) do update set director_identity=coalesce(ci,aulanexo_private.school_contacts.director_identity),director_phone=coalesce(phone,aulanexo_private.school_contacts.director_phone);
 end if;
end $$;

alter table public.classrooms add column start_time time, add column end_time time,
 add column weekdays integer[] not null default array[1,2,3,4,5],
 add column capacity integer not null default 30 check(capacity between 1 and 500),
 add column active boolean not null default true, add column monthly_fee numeric(12,2) not null default 0 check(monthly_fee>=0);
alter table public.classrooms add constraint classroom_hours_order check(start_time is null or end_time is null or end_time>start_time);
alter table public.classrooms add constraint classroom_weekdays check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]);
update public.classrooms set start_time=substring(schedule from '([0-2][0-9]:[0-5][0-9])')::time,
 end_time=substring(schedule from '[0-2][0-9]:[0-5][0-9][^0-9]+([0-2][0-9]:[0-5][0-9])')::time
where schedule ~ '^[0-1][0-9]:[0-5][0-9][^0-9]+[0-1][0-9]:[0-5][0-9]$'
 and substring(schedule from '([0-2][0-9]:[0-5][0-9])')::time < substring(schedule from '[0-2][0-9]:[0-5][0-9][^0-9]+([0-2][0-9]:[0-5][0-9])')::time;
alter function public.save_classroom(jsonb,uuid[]) rename to save_classroom_legacy;
alter function public.save_classroom_legacy(jsonb,uuid[]) set schema aulanexo_private;
revoke all on function aulanexo_private.save_classroom_legacy(jsonb,uuid[]) from public,anon,authenticated;
create function public.save_classroom(p_room jsonb,p_teacher_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare room_id uuid:=(p_room->>'id')::uuid; beginning time; ending time; days integer[]; capacity_value integer; year_value integer; begin
 perform aulanexo_private.save_classroom_legacy(p_room,p_teacher_ids);
 if p_room ? 'start_time' or p_room ? 'end_time' then
  beginning:=nullif(p_room->>'start_time','')::time; ending:=nullif(p_room->>'end_time','')::time;
  if beginning is null or ending is null or ending<=beginning then raise exception 'Selecciona un horario de inicio y fin válido.'; end if;
  if jsonb_typeof(p_room->'weekdays')<>'array' then raise exception 'Selecciona los días de clase.'; end if;
  select array_agg(distinct value::integer order by value::integer) into days from jsonb_array_elements_text(p_room->'weekdays');
  if cardinality(days) is null or cardinality(days)=0 or not(days<@array[1,2,3,4,5,6,7]) then raise exception 'Selecciona los días de clase.'; end if;
  update public.classrooms set start_time=beginning,end_time=ending,weekdays=days,schedule=to_char(beginning,'HH24:MI')||' – '||to_char(ending,'HH24:MI') where id=room_id;
 end if;
 capacity_value:=coalesce((p_room->>'capacity')::integer,(select capacity from public.classrooms where id=room_id));
 if capacity_value < (select count(*) from public.students where classroom_id=room_id and status<>'inactive') then raise exception 'La capacidad no puede ser menor al número de inscripciones vigentes.'; end if;
 year_value:=coalesce((p_room->>'academic_year')::integer,(select academic_year from public.classrooms where id=room_id));
 if year_value not between 2020 and 2100 then raise exception 'Gestión inválida.'; end if;
 update public.classrooms set monthly_fee=coalesce((p_room->>'monthly_fee')::numeric,monthly_fee),capacity=capacity_value,academic_year=year_value,active=coalesce((p_room->>'active')::boolean,active) where id=room_id;
end $$;
create function public.save_teacher_with_classrooms(p_teacher jsonb,p_classroom_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare school_id_value uuid:=(p_teacher->>'school_id')::uuid; teacher_id_value uuid:=(p_teacher->>'id')::uuid; begin
 if not public.has_school_role(school_id_value,array['director']) then raise exception 'Solo Dirección administra docentes.'; end if;
 if coalesce(cardinality(p_classroom_ids),0)=0 then raise exception 'Selecciona al menos un aula para el docente.'; end if;
 if exists(select 1 from unnest(p_classroom_ids) c where not exists(select 1 from public.classrooms r where r.id=c and r.school_id=school_id_value)) then raise exception 'Aula no válida.'; end if;
 perform public.save_teacher(p_teacher);
 delete from public.teacher_classrooms where teacher_id=teacher_id_value and not(classroom_id=any(p_classroom_ids));
 insert into public.teacher_classrooms(school_id,teacher_id,classroom_id) select school_id_value,teacher_id_value,c from (select distinct unnest(p_classroom_ids) c) rooms on conflict do nothing;
end $$;

-- Un docente asignado puede consultar su aula incluso antes de la primera inscripción.
create or replace function public.may_use_classroom(p_school_id uuid,p_classroom_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not public.is_platform_admin() and aulanexo_private.in_support_school(p_school_id) and (
 public.has_school_role(p_school_id,array['director'])
 or (public.has_school_role(p_school_id,array['teacher']) and exists(select 1 from public.teacher_classrooms tc join public.teachers t on t.id=tc.teacher_id and t.school_id=tc.school_id join public.schools sch on sch.id=tc.school_id where tc.school_id=p_school_id and (p_classroom_id is null or tc.classroom_id=p_classroom_id) and t.user_id=aulanexo_private.actor_uid() and t.status='active' and sch.status='active'))
 or exists(select 1 from public.students s where s.school_id=p_school_id and (p_classroom_id is null or s.classroom_id=p_classroom_id) and public.family_access(s.id)));
$$;

create table public.school_operation_settings (
 school_id uuid primary key references public.schools(id) on delete cascade,
 final_full_installments integer not null default 2 check(final_full_installments between 1 and 6),
 require_annual_materials boolean not null default true
);
alter table public.school_operation_settings enable row level security;
revoke all on public.school_operation_settings from public,anon,authenticated;
grant select on public.school_operation_settings to authenticated;
create policy operation_settings_read on public.school_operation_settings for select to authenticated using((public.has_school_role(school_id,array['director']) or public.is_platform_admin()) and aulanexo_private.in_support_school(school_id));

create table public.academic_requests (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),classroom_id uuid not null,
 kind text not null check(kind in ('annual_materials','monthly_materials','specific_materials','activity')),
 academic_year integer not null check(academic_year between 2020 and 2100),title text not null check(length(trim(title)) between 3 and 160),
 details text not null check(length(trim(details)) between 3 and 12000),event_date date not null,
 amount numeric(12,2) not null default 0 check(amount>=0),due_date date,blocks_access boolean not null default true,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_by uuid not null references auth.users(id),reviewed_by uuid references auth.users(id),review_note text not null default '',
 created_at timestamptz not null default now(),reviewed_at timestamptz,
 unique(id,school_id),
 foreign key(classroom_id,school_id) references public.classrooms(id,school_id),
 check(amount=0 or due_date is not null)
);
create unique index annual_materials_once on public.academic_requests(classroom_id,academic_year) where kind='annual_materials' and status='approved';
create table public.activity_participations (
 request_id uuid not null references public.academic_requests(id),student_id uuid not null references public.students(id),school_id uuid not null references public.schools(id),
 participating boolean not null default true,reason text not null default '',updated_by uuid references auth.users(id),updated_at timestamptz not null default now(),
 primary key(request_id,student_id),check(participating or length(trim(reason))>=5)
);
alter table public.academic_requests enable row level security;
alter table public.activity_participations enable row level security;
revoke all on public.academic_requests,public.activity_participations from public,anon,authenticated;
grant select on public.academic_requests,public.activity_participations to authenticated;
create policy requests_academic_read on public.academic_requests for select to authenticated using(
 aulanexo_private.in_support_school(school_id) and not public.is_platform_admin() and
 (public.has_school_role(school_id,array['director']) or (public.may_edit_classroom(school_id,classroom_id)) or (status='approved' and public.may_use_classroom(school_id,classroom_id))));
create policy activity_participations_read on public.activity_participations for select to authenticated using(aulanexo_private.in_support_school(school_id) and not public.is_platform_admin() and (public.may_manage_student(student_id) or public.may_teacher_write(student_id) or public.is_verified_guardian(student_id)));
alter table public.school_charges add column academic_request_id uuid;
alter table public.school_charges add foreign key(academic_request_id,school_id) references public.academic_requests(id,school_id);

create function public.save_academic_request(p_request jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid:=coalesce((p_request->>'id')::uuid,gen_random_uuid()); school_value uuid:=(p_request->>'school_id')::uuid;room_value uuid:=(p_request->>'classroom_id')::uuid; existing public.academic_requests; begin
 if not public.may_edit_classroom(school_value,room_value) then raise exception 'No tienes permiso para solicitar materiales o actividades de esta aula.'; end if;
 select * into existing from public.academic_requests where id=request_id for update;
 if existing.id is not null and (existing.school_id<>school_value or existing.classroom_id<>room_value or existing.status='approved' or (existing.created_by<>aulanexo_private.actor_uid() and not public.has_school_role(school_value,array['director']))) then raise exception 'Una solicitud aprobada conserva su contenido. Crea otra para un nuevo pedido.'; end if;
 if not exists(select 1 from public.classrooms where id=room_value and school_id=school_value and active and academic_year=(p_request->>'academic_year')::integer) then raise exception 'Selecciona un aula activa.'; end if;
 insert into public.academic_requests(id,school_id,classroom_id,kind,academic_year,title,details,event_date,amount,due_date,blocks_access,created_by)
 values(request_id,school_value,room_value,p_request->>'kind',(p_request->>'academic_year')::integer,trim(p_request->>'title'),trim(p_request->>'details'),(p_request->>'event_date')::date,coalesce((p_request->>'amount')::numeric,0),nullif(p_request->>'due_date','')::date,coalesce((p_request->>'blocks_access')::boolean,true),aulanexo_private.actor_uid())
 on conflict(id) do update set kind=excluded.kind,academic_year=excluded.academic_year,title=excluded.title,details=excluded.details,event_date=excluded.event_date,amount=excluded.amount,due_date=excluded.due_date,blocks_access=excluded.blocks_access,status='pending',reviewed_by=null,reviewed_at=null,review_note='';
 return request_id;
end $$;
create function public.review_academic_request(p_id uuid,p_approve boolean,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare request public.academic_requests; begin
 select * into request from public.academic_requests where id=p_id for update;
 if request.id is null or not public.has_school_role(request.school_id,array['director']) then raise exception 'Solo Dirección aprueba materiales y actividades.'; end if;
 if request.status='approved' then return; end if;
 if p_approve is null then raise exception 'Indica tu decisión.'; end if;
 if not p_approve and length(trim(p_note))<5 then raise exception 'Escribe el motivo de rechazo.'; end if;
 update public.academic_requests set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=aulanexo_private.actor_uid(),reviewed_at=now(),review_note=left(trim(p_note),500) where id=p_id;
 if not p_approve then return; end if;
 insert into public.calendar_events(id,school_id,classroom_id,title,description,event_date,type) values(request.id,request.school_id,request.classroom_id,request.title,request.details,request.event_date,case when request.kind='activity' then 'event' else 'materials' end);
 insert into public.announcements(school_id,classroom_id,title,content,audience) values(request.school_id,request.classroom_id,request.title,request.details,'families');
 if request.amount>0 then
  insert into public.activity_participations(request_id,student_id,school_id) select request.id,id,school_id from public.students where classroom_id=request.classroom_id and school_id=request.school_id and status<>'inactive';
  insert into public.school_charges(school_id,student_id,concept,due_date,amount,academic_request_id)
  select request.school_id,s.id,request.title,request.due_date,request.amount,request.id from public.students s where s.school_id=request.school_id and s.classroom_id=request.classroom_id and s.status<>'inactive';
 end if;
exception when unique_violation then raise exception 'Ya hay una lista anual aprobada para esta aula y gestión.';
end $$;
create function public.set_activity_participation(p_request_id uuid,p_student_id uuid,p_participating boolean,p_reason text default '') returns void language plpgsql security definer set search_path='' as $$
declare request public.academic_requests; child public.students; begin
 select * into request from public.academic_requests where id=p_request_id for update;
 select * into child from public.students where id=p_student_id;
 if request.id is null or child.id is null or child.school_id<>request.school_id or child.classroom_id<>request.classroom_id or request.status<>'approved' or request.amount<=0 then raise exception 'No hay una actividad cobrable para este estudiante.'; end if;
 if not(public.may_manage_student(child.id) or public.may_teacher_write(child.id) or public.is_verified_guardian(child.id)) then raise exception 'No tienes acceso a esta participación.'; end if;
 if p_participating is null or (not p_participating and length(trim(p_reason))<5) then raise exception 'Escribe el motivo de no participación.'; end if;
 perform 1 from public.school_charges where academic_request_id=request.id and student_id=child.id for update;
 if exists(select 1 from public.school_payments p join public.school_charges c on c.id=p.charge_id where c.academic_request_id=request.id and c.student_id=child.id and p.verification_state='verified') then raise exception 'Ya hay un pago registrado. Dirección debe revisar el cobro antes de cambiar la participación.'; end if;
 insert into public.activity_participations(request_id,student_id,school_id,participating,reason,updated_by) values(request.id,child.id,child.school_id,p_participating,left(trim(p_reason),500),aulanexo_private.actor_uid())
 on conflict(request_id,student_id) do update set participating=excluded.participating,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now();
 update public.school_charges set status=case when p_participating then 'pending' else 'cancelled' end where academic_request_id=request.id and student_id=child.id;
 if p_participating and not exists(select 1 from public.school_charges where academic_request_id=request.id and student_id=child.id) then
  insert into public.school_charges(school_id,student_id,concept,due_date,amount,academic_request_id) values(child.school_id,child.id,request.title,request.due_date,request.amount,request.id);
 end if;
end $$;

create function aulanexo_private.validate_admission_room(p_student uuid,p_room uuid,p_school uuid) returns void language plpgsql security definer set search_path='' as $$
declare room public.classrooms; existing_room uuid; begin
 select classroom_id into existing_room from public.students where id=p_student and status<>'inactive';
 select * into room from public.classrooms where id=p_room and school_id=p_school for update;
 if room.id is null then raise exception 'Selecciona un aula válida.'; end if;
 if existing_room is not distinct from p_room then return; end if;
 if not room.active then raise exception 'Esta aula no admite nuevas inscripciones.'; end if;
 if (select count(*) from public.students where classroom_id=room.id and status<>'inactive' and id<>p_student)>=room.capacity then raise exception 'El aula no tiene cupos disponibles.'; end if;
 if coalesce((select require_annual_materials from public.school_operation_settings where school_id=p_school),true)
 and not exists(select 1 from public.academic_requests where classroom_id=room.id and academic_year=room.academic_year and kind='annual_materials' and status='approved') then raise exception 'Primero publica y aprueba la lista anual de materiales de esta aula.'; end if;
end $$;
revoke all on function aulanexo_private.validate_admission_room(uuid,uuid,uuid) from public,anon,authenticated;
alter function public.enroll_student(jsonb) rename to enroll_student_care;
alter function public.enroll_student_care(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.enroll_student_care(jsonb) from public,anon,authenticated;
create function public.enroll_student(p_student jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.has_school_role((p_student->>'school_id')::uuid,array['director']) then raise exception 'Solo Dirección puede inscribir estudiantes.'; end if;
 perform aulanexo_private.validate_admission_room((p_student->>'id')::uuid,(p_student->>'classroom_id')::uuid,(p_student->>'school_id')::uuid);
 perform aulanexo_private.enroll_student_care(p_student);
end $$;
alter function public.save_student(jsonb) rename to save_student_care;
alter function public.save_student_care(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.save_student_care(jsonb) from public,anon,authenticated;
create function public.save_student(p_student jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.may_manage_student((p_student->>'id')::uuid) then raise exception 'Solo Dirección puede editar estudiantes.'; end if;
 if p_student ? 'classroom_id' then perform aulanexo_private.validate_admission_room((p_student->>'id')::uuid,(p_student->>'classroom_id')::uuid,(p_student->>'school_id')::uuid); end if;
 perform aulanexo_private.save_student_care(p_student);
end $$;
create function public.enroll_student_with_plan(p_student jsonb,p_plan jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if (p_student->>'id') is distinct from (p_plan->>'student_id') or (p_student->>'school_id') is distinct from (p_plan->>'school_id') then raise exception 'El plan debe corresponder al estudiante inscrito.'; end if;
 perform public.enroll_student(p_student);
 perform public.create_payment_plan(p_plan);
end $$;
alter table public.students add column withdrawal_reason text not null default '';
alter function public.set_student_status(uuid,text) rename to set_student_status_without_reason;
alter function public.set_student_status_without_reason(uuid,text) set schema aulanexo_private;
revoke all on function aulanexo_private.set_student_status_without_reason(uuid,text) from public,anon,authenticated;
create function public.set_student_status(p_student_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare child public.students; begin
 if p_status='inactive' then raise exception 'Usa la baja con motivo para retirar al estudiante.'; end if;
 if not public.may_manage_student(p_student_id) then raise exception 'Solo Dirección puede modificar la inscripción.'; end if;
 select * into child from public.students where id=p_student_id for update;
 if child.status='inactive' and p_status in ('active','pending') then perform aulanexo_private.validate_admission_room(child.id,child.classroom_id,child.school_id); end if;
 perform aulanexo_private.set_student_status_without_reason(p_student_id,p_status);
end $$;
create function public.withdraw_student(p_student_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.may_manage_student(p_student_id) then raise exception 'Solo Dirección puede dar de baja.'; end if;
 if length(trim(p_reason)) not between 5 and 1000 then raise exception 'Indica el motivo de la baja (5 a 1000 caracteres).'; end if;
 perform aulanexo_private.set_student_status_without_reason(p_student_id,'inactive');
 update public.students set withdrawal_reason=trim(p_reason) where id=p_student_id;
end $$;
-- Registrar también las entidades con clave compuesta sin copiar detalles sensibles.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('aulanexo_private.capture_audit()'::regprocedure);
 definition:=replace(definition,'coalesce(value->>''id'',value->>''classroom_id'')::uuid','coalesce(value->>''id'',value->>''classroom_id'',value->>''request_id'',value->>''school_id'')::uuid');
 execute definition;
end $$;

revoke all on function public.institution_private_contact(uuid),public.save_school(jsonb),public.save_classroom(jsonb,uuid[]),public.save_teacher_with_classrooms(jsonb,uuid[]),public.save_academic_request(jsonb),public.review_academic_request(uuid,boolean,text),public.set_activity_participation(uuid,uuid,boolean,text),public.enroll_student(jsonb),public.save_student(jsonb),public.enroll_student_with_plan(jsonb,jsonb),public.withdraw_student(uuid,text),public.set_student_status(uuid,text) from public,anon;
grant execute on function public.institution_private_contact(uuid),public.save_school(jsonb),public.save_classroom(jsonb,uuid[]),public.save_teacher_with_classrooms(jsonb,uuid[]),public.save_academic_request(jsonb),public.review_academic_request(uuid,boolean,text),public.set_activity_participation(uuid,uuid,boolean,text),public.enroll_student(jsonb),public.save_student(jsonb),public.enroll_student_with_plan(jsonb,jsonb),public.withdraw_student(uuid,text),public.set_student_status(uuid,text) to authenticated;
create trigger audit_academic_request after insert or update on public.academic_requests for each row execute function aulanexo_private.capture_audit();
create trigger audit_activity_participation after insert or update on public.activity_participations for each row execute function aulanexo_private.capture_audit();

create policy teacher_material_approval on public.calendar_events as restrictive for insert to authenticated with check(type<>'materials' or public.has_school_role(school_id,array['director']));

create policy teacher_material_update_approval on public.calendar_events as restrictive for update to authenticated
 using(public.has_school_role(school_id,array['director']) or (type<>'materials' and not exists(select 1 from public.academic_requests r where r.id=calendar_events.id and r.status='approved')))
 with check(public.has_school_role(school_id,array['director']) or (type<>'materials' and not exists(select 1 from public.academic_requests r where r.id=calendar_events.id and r.status='approved')));
create policy teacher_material_delete_approval on public.calendar_events as restrictive for delete to authenticated
 using(public.has_school_role(school_id,array['director']) or (type<>'materials' and not exists(select 1 from public.academic_requests r where r.id=calendar_events.id and r.status='approved')));
