-- Importación atómica e idempotente: previsualizar nunca persiste alumnos/cobros.
create table aulanexo_private.directory_imports (
 id uuid primary key,school_id uuid not null references public.schools(id),kind text not null,request_hash text not null,
 result jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
revoke all on aulanexo_private.directory_imports from public,anon,authenticated;
create function aulanexo_private.import_directory_row(p_school uuid,p_kind text,p_row jsonb,p_activation numeric,p_license numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare room public.classrooms;target uuid:=gen_random_uuid();teacher_payload jsonb;student_payload jsonb;plan_payload jsonb;rooms uuid[];room_name text:=trim(coalesce(p_row->>'classroom',''));begin
 if p_kind='teachers' then
  if length(trim(coalesce(p_row->>'name','')))<2 or coalesce(p_row->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Completa nombre y correo válido del docente.';end if;
  if exists(select 1 from public.teachers where school_id=p_school and lower(email)=lower(trim(p_row->>'email'))) then raise exception 'El correo docente ya está registrado.';end if;
  select array_agg(r.id) into rooms from public.classrooms r where r.school_id=p_school and r.academic_year=(p_row->>'year')::integer and r.active and r.name=any(string_to_array(room_name,'|'));
  if coalesce(cardinality(rooms),0)<>cardinality(string_to_array(room_name,'|')) then raise exception 'Revisa las aulas y la gestión. Separa varias aulas con |.';end if;
  teacher_payload:=jsonb_build_object('id',target,'school_id',p_school,'name',trim(p_row->>'name'),'email',lower(trim(p_row->>'email')),'specialty',coalesce(p_row->>'specialty',''),'status','pending');
  perform public.save_teacher_with_classrooms(teacher_payload,rooms);
 else
  if length(trim(coalesce(p_row->>'first_name','')))<2 or length(trim(coalesce(p_row->>'last_name','')))<2 or nullif(p_row->>'birth_date','') is null then raise exception 'Completa nombres, apellidos y fecha de nacimiento.';end if;
  select * into room from public.classrooms where school_id=p_school and name=room_name and academic_year=(p_row->>'year')::integer;
  if room.id is null then raise exception 'No existe el aula en esa gestión.';end if;
  student_payload:=p_row||jsonb_build_object('id',target,'school_id',p_school,'classroom_id',room.id,'monthly_fee',coalesce(nullif(p_row->>'monthly_fee','')::numeric,room.monthly_fee),'snack_fee',coalesce(nullif(p_row->>'snack_fee','')::numeric,0),'enrollment_fee',coalesce(nullif(p_row->>'enrollment_fee','')::numeric,0),'activation_fee_quote',p_activation);
  plan_payload:=jsonb_build_object('id',gen_random_uuid(),'school_id',p_school,'student_id',target,'start_date',coalesce(nullif(p_row->>'start_date',''),(now() at time zone 'America/La_Paz')::date::text),'months',coalesce(nullif(p_row->>'months','')::integer,10),'due_day',coalesce(nullif(p_row->>'due_day','')::integer,10),'monthly_fee',student_payload->'monthly_fee','snack_fee',student_payload->'snack_fee','enrollment_fee',student_payload->'enrollment_fee','discount',0,'prorate',false,'license_fee',p_license);
  perform public.enroll_student_with_plan(student_payload,plan_payload);
 end if;
 return target;
end $$;
revoke all on function aulanexo_private.import_directory_row(uuid,text,jsonb,numeric,numeric) from public,anon,authenticated;
create function public.import_school_directory(p_school_id uuid,p_kind text,p_rows jsonb,p_commit boolean default false,p_batch_id uuid default null,p_activation_quote numeric default null,p_license_quote numeric default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare row_value jsonb;results jsonb:='[]';idx integer:=0;target uuid;issue text;prior aulanexo_private.directory_imports;hash_value text:=md5(p_kind||p_rows::text);activation numeric;license numeric;begin
 if not public.school_director(p_school_id) then raise exception 'Solo Dirección puede importar estudiantes y docentes.';end if;
 if p_kind is null or p_kind not in ('students','teachers') or p_commit is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Selecciona entre 1 y 200 filas de estudiantes o docentes.';end if;
 perform pg_advisory_xact_lock(hashtext('school-directory-import'),hashtext(p_school_id::text));
 if p_commit then
  if p_batch_id is null then raise exception 'Falta el identificador de importación.';end if;
  select * into prior from aulanexo_private.directory_imports where id=p_batch_id;
  if prior.id is not null then
   if prior.school_id<>p_school_id or prior.request_hash<>hash_value then raise exception 'Este identificador pertenece a otra importación.';end if;return prior.result;
  end if;
 end if;
 activation:=aulanexo_private.platform_fee(p_school_id,'activation');license:=aulanexo_private.platform_fee(p_school_id,'monthly');
 if p_commit and p_kind='students' and (p_activation_quote is distinct from activation or p_license_quote is distinct from license) then raise exception 'Las tarifas cambiaron. Vuelve a previsualizar antes de importar.';end if;
 if p_kind='students' and exists(
 select 1 from (select trim(r->>'classroom') room,(r->>'year')::integer yr,count(*) n from jsonb_array_elements(p_rows) r group by 1,2) imported
 join public.classrooms c on c.school_id=p_school_id and c.name=imported.room and c.academic_year=imported.yr
 where imported.n+(select count(*) from public.students s where s.classroom_id=c.id and s.status<>'inactive')>c.capacity
 ) then raise exception 'El archivo supera los cupos disponibles de un aula.';end if;
 -- Duplicados dentro del archivo, incluyendo niños sin CI/RUDE.
 if p_kind='teachers' and exists(select 1 from jsonb_array_elements(p_rows) r group by lower(trim(r->>'email')) having count(*)>1) then raise exception 'Hay correos docentes repetidos en el archivo.';end if;
 if p_kind='students' and exists(select 1 from jsonb_array_elements(p_rows) r cross join lateral (values('ci',upper(regexp_replace(coalesce(r->>'identity_number',''),'\s','','g'))),('rude',upper(regexp_replace(coalesce(r->>'rude',''),'\s','','g')))) k(kind,value) where k.value<>'' group by k.kind,k.value having count(*)>1) then raise exception 'Hay CI o RUDE repetidos en el archivo.';end if;
 for row_value in select value from jsonb_array_elements(p_rows) loop
  idx:=idx+1;issue:=null;
  begin
   target:=aulanexo_private.import_directory_row(p_school_id,p_kind,row_value,activation,license);
   if not p_commit then raise sqlstate 'P9998' using message='preview_only';end if;
  exception when sqlstate 'P9998' then null;
  when others then issue:=sqlerrm;
  end;
  results:=results||jsonb_build_array(jsonb_build_object('row',idx,'ok',issue is null,'error',issue,'id',case when p_commit and issue is null then target end));
  if p_commit and issue is not null then raise exception 'Fila %: %. No se importó ninguna fila.',idx,issue;end if;
 end loop;
 results:=jsonb_build_object('rows',results,'committed',p_commit,'count',idx,'activationFee',activation,'licenseFee',license);
 if p_commit then
  insert into aulanexo_private.directory_imports(id,school_id,kind,request_hash,result,created_by) values(p_batch_id,p_school_id,p_kind,hash_value,results,auth.uid());
  insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_school_id,auth.uid(),'Dirección','directory_imports',p_batch_id,'IMPORT',jsonb_build_object('kind',p_kind,'count',idx));
 end if;
 return results;
end $$;
-- RPC invoker: cada tabla aplica sus políticas, también en soporte y cuentas familiares.
create function public.school_workspace(p_school_id uuid,p_from date default (now() at time zone 'America/La_Paz')::date-30,p_to date default (now() at time zone 'America/La_Paz')::date) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>92 then raise exception 'Selecciona hasta 93 días de cuidados.';end if;
 return jsonb_build_object(
 'years',coalesce((select jsonb_agg(to_jsonb(x) order by x.year desc) from public.academic_years x where school_id=p_school_id),'[]'::jsonb),
 'enrollments',coalesce((select jsonb_agg(to_jsonb(x) order by x.started_on desc) from public.enrollment_history x where school_id=p_school_id),'[]'::jsonb),
 'care',coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date desc,x.occurred_at) from public.care_records x where school_id=p_school_id and entry_date between p_from and p_to),'[]'::jsonb),
 'terms',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_on) from public.academic_terms x where school_id=p_school_id),'[]'::jsonb),
 'assessments',coalesce((select jsonb_agg(to_jsonb(x) order by x.assessment_date) from public.assessments x where school_id=p_school_id),'[]'::jsonb),
 'scores',coalesce((select jsonb_agg(to_jsonb(x)) from public.assessment_scores x where school_id=p_school_id),'[]'::jsonb),
 'cards',coalesce((select jsonb_agg(to_jsonb(x) order by x.published_at desc) from public.report_cards x where school_id=p_school_id),'[]'::jsonb));
end $$;
revoke all on function public.import_school_directory(uuid,text,jsonb,boolean,uuid,numeric,numeric),public.school_workspace(uuid,date,date) from public,anon;
grant execute on function public.import_school_directory(uuid,text,jsonb,boolean,uuid,numeric,numeric),public.school_workspace(uuid,date,date) to authenticated;
