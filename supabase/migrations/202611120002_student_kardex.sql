-- A student's history stays in the existing institution; no split or parallel database.
create table aulanexo_private.student_history_events(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 student_id uuid not null references public.students(id),occurred_at timestamptz not null default clock_timestamp(),
 kind text not null,title text not null,body text not null,actor_id uuid
);
create index student_history_page on aulanexo_private.student_history_events(student_id,occurred_at desc,id desc);
revoke all on aulanexo_private.student_history_events from public,anon,authenticated,service_role;
create function aulanexo_private.track_student_kardex() returns trigger language plpgsql security definer set search_path='' as $$
declare title_value text;body_value text;begin
 if TG_OP='INSERT' then title_value:='Ficha de estudiante creada';body_value:='Registro inicial en MiCole.';
 elsif new.status is distinct from old.status then
  title_value:=case new.status when 'inactive' then 'Retiro o baja del estudiante' when 'active' then 'Activación del estudiante' else 'Cambio de estado' end;
  body_value:=case new.status when 'inactive' then coalesce(new.withdrawal_reason,'') else 'Estado anterior: '||old.status||'. Estado actual: '||new.status||'.' end;
 elsif new.classroom_id is distinct from old.classroom_id then
  title_value:='Cambio de aula o paralelo';
  body_value:=concat('De ',(select name from public.classrooms where id=old.classroom_id),' a ',(select name from public.classrooms where id=new.classroom_id),'.');
 elsif (to_jsonb(new)-array['updated_at','access_until']) is distinct from (to_jsonb(old)-array['updated_at','access_until']) then
  title_value:='Ficha del estudiante actualizada';body_value:='Se actualizaron datos de la ficha. Los datos personales vigentes se consultan en su expediente.';
 else return new;end if;
 insert into aulanexo_private.student_history_events(school_id,student_id,kind,title,body,actor_id)
 values(new.school_id,new.id,'administrative',title_value,coalesce(body_value,''),aulanexo_private.actor_uid());
 return new;
end $$;
revoke all on function aulanexo_private.track_student_kardex() from public,anon,authenticated,service_role;
create trigger student_kardex_history after insert or update on public.students for each row execute function aulanexo_private.track_student_kardex();
create trigger student_kardex_signal after insert on aulanexo_private.student_history_events for each row execute function aulanexo_private.touch_workspace();
create index kardex_enrollment_student on public.enrollment_history(student_id,started_on desc);
create index kardex_documents_student on public.student_documents(student_id,created_at desc);
create index kardex_observations_student on public.student_observations(student_id,created_at desc);
create index kardex_receipts_student on public.school_receipts(student_id,created_at desc);

create function public.student_kardex(p_student uuid,p_from date default null,p_to date default null,p_kind text default 'all',p_cursor jsonb default null,p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare child public.students;admin boolean;family boolean;academic boolean;finance boolean;full_academic boolean;events jsonb;page jsonb;more boolean;last_row jsonb;
begin
 select * into child from public.students where id=p_student;
 if auth.uid() is null or child.id is null or public.is_platform_admin() or not aulanexo_private.in_support_school(child.school_id)
 or not exists(select 1 from public.schools where id=child.school_id and status='active') then raise exception 'No tienes acceso al kárdex de este estudiante.';end if;
 admin:=public.school_director(child.school_id) or public.school_secretary(child.school_id);
 family:=public.is_verified_guardian(child.id);
 if not(admin or family or public.may_edit_classroom(child.school_id,child.classroom_id)) then raise exception 'No tienes acceso al kárdex de este estudiante.';end if;
 if p_kind is null or p_kind not in ('all','enrollment','administrative','attendance','academic','followup','documents','payments','care','requests') or p_limit is null or p_limit not between 1 and 100 or p_from>p_to then raise exception 'Revisa los filtros del kárdex.';end if;
 if p_cursor is not null and (jsonb_typeof(p_cursor)<>'object' or p_cursor->>'at' is null or p_cursor->>'key' is null) then raise exception 'Actualiza la página del historial.';end if;
 full_academic:=public.school_director(child.school_id) or public.is_classroom_tutor(child.classroom_id);
 academic:=not family or public.family_access(child.id);
 finance:=public.school_director(child.school_id) or public.school_secretary(child.school_id,true) or family;
 with history as (
  select 'enrollment:'||h.id::text key,(h.started_on::timestamp at time zone 'America/La_Paz') as "at",'enrollment' kind,'Inscripción en '||h.classroom_name title,
   'Gestión '||y.year||' · '||h.level body,h.classroom_name classroom,y.year as "year",jsonb_build_object('status',h.status) details
   from public.enrollment_history h join public.academic_years y on y.id=h.year_id where h.student_id=child.id and h.school_id=child.school_id
  union all select 'enrollment-end:'||h.id::text,h.ended_on::timestamp at time zone 'America/La_Paz','enrollment',case h.status when 'withdrawn' then 'Retiro del curso' when 'transferred' then 'Traslado de paralelo' else 'Gestión completada' end,h.reason,h.classroom_name,y.year,jsonb_build_object('status',h.status)
   from public.enrollment_history h join public.academic_years y on y.id=h.year_id where h.student_id=child.id and h.school_id=child.school_id and h.ended_on is not null
  union all select 'record:'||e.id::text,e.occurred_at,e.kind,e.title,e.body,null,null,'{}'::jsonb from aulanexo_private.student_history_events e where e.student_id=child.id and e.school_id=child.school_id
  union all select 'attendance:'||r.id::text,s.attendance_date::timestamp at time zone 'America/La_Paz','attendance','Asistencia diaria',coalesce(aulanexo_private.attendance_effective(r.id)->>'note',''),c.name,c.academic_year,jsonb_build_object('status',aulanexo_private.attendance_effective(r.id)->>'status')
   from public.student_attendance_records r join public.student_attendance_sessions s on s.id=r.session_id join public.classrooms c on c.id=s.classroom_id where r.student_id=child.id and r.school_id=child.school_id and s.status='confirmed'
  union all select 'correction:'||co.id::text,co.reviewed_at,'attendance','Corrección de asistencia aprobada',case when family then '' else co.reason end,c.name,c.academic_year,jsonb_build_object('previousStatus',co.previous_status,'status',co.proposed_status)
   from public.student_attendance_corrections co join public.student_attendance_records r on r.id=co.record_id join public.student_attendance_sessions s on s.id=r.session_id join public.classrooms c on c.id=s.classroom_id where r.student_id=child.id and co.school_id=child.school_id and co.status='approved'
  union all select 'lesson:'||s.id::text,(s.attendance_date+s.lesson::time) at time zone 'America/La_Paz','attendance','Asistencia · '||coalesce(ss.name,'Materia'),coalesce(r->>'note',''),c.name,c.academic_year,jsonb_build_object('status',r->>'status','lesson',s.lesson)
   from aulanexo_private.subject_attendance s join public.classrooms c on c.id=s.classroom_id join public.class_subjects cs on cs.id=s.class_subject_id left join public.school_subjects ss on ss.id=cs.subject_id cross join lateral jsonb_array_elements(s.records) r
   where s.school_id=child.school_id and s.status='confirmed' and r->>'studentId'=child.id::text and academic and (full_academic or public.subject_observer(cs.id) or family)
  union all select 'score:'||sc.id::text,sc.updated_at,'academic',a.title||' · '||t.name,sc.comment,c.name,c.academic_year,jsonb_build_object('score',sc.score,'maxScore',a.max_score,'qualitative',sc.qualitative_score,'exempt',sc.exempt,'weight',a.weight)
   from public.assessment_scores sc join public.assessments a on a.id=sc.assessment_id join public.academic_terms t on t.id=a.term_id join public.classrooms c on c.id=a.classroom_id where sc.student_id=child.id and sc.school_id=child.school_id and not family and (full_academic or public.learning_can_manage(a.classroom_id,a.class_subject_id))
  union all select 'report:'||r.id::text,r.published_at,'academic','Libreta publicada · '||t.name,'Versión '||r.revision,c.name,c.academic_year,jsonb_build_object('revision',r.revision,'revoked',r.revoked_at is not null)
   from public.report_cards r join public.academic_terms t on t.id=r.term_id join public.classrooms c on c.id=r.classroom_id where r.student_id=child.id and r.school_id=child.school_id and academic and (full_academic or not family and public.may_edit_classroom(child.school_id,r.classroom_id) or family and r.revoked_at is null)
  union all select 'observation:'||o.id::text,o.created_at,'followup',case o.kind when 'positive' then 'Reconocimiento' else 'Incidencia' end,o.body,c.name,c.academic_year,jsonb_build_object('kind',o.kind,'hasPhoto',o.photo is not null)
   from public.student_observations o join public.classrooms c on c.id=o.classroom_id where o.student_id=child.id and o.school_id=child.school_id and public.observation_visible(o.id)
  union all select 'diary:'||r.id::text,r.created_at,'followup','Cuaderno · '||r.category,r.note,c.name,c.academic_year,'{}'::jsonb
   from public.daily_entries r left join lateral (select h.classroom_name name,y.year academic_year from public.enrollment_history h join public.academic_years y on y.id=h.year_id where h.student_id=r.student_id and h.started_on<=r.entry_date and coalesce(h.ended_on,r.entry_date)>=r.entry_date order by h.started_on desc,h.id limit 1) c on true where r.student_id=child.id and r.school_id=child.school_id and (public.school_director(child.school_id) or public.may_edit_classroom(child.school_id,child.classroom_id) or family and academic)
  union all select 'grade-change:'||ch.id::text,ch.created_at,'academic','Corrección de nota · '||a.title,'Se conserva la calificación anterior.',c.name,c.academic_year,jsonb_build_object('previousScore',ch.previous->'score','score',ch.current_value->'score','maxScore',a.max_score,'qualitative',ch.current_value->>'qualitative_score')
   from public.assessment_score_changes ch join public.assessment_scores sc on sc.id=ch.score_id join public.assessments a on a.id=sc.assessment_id join public.classrooms c on c.id=a.classroom_id where sc.student_id=child.id and ch.school_id=child.school_id and not family and (full_academic or public.learning_can_manage(a.classroom_id,a.class_subject_id))
  union all select 'submission:'||sub.id::text,coalesce(sub.reviewed_at,sub.submitted_at),'academic','Entrega · '||a.title,sub.feedback,c.name,c.academic_year,jsonb_build_object('status',sub.status,'score',sub.score,'maxScore',a.max_score)
   from public.assignment_submissions sub join public.assignments a on a.id=sub.assignment_id join public.classrooms c on c.id=a.classroom_id where sub.student_id=child.id and sub.school_id=child.school_id and sub.status<>'draft' and academic and (full_academic or not family and public.learning_can_manage(a.classroom_id,a.class_subject_id) or family and a.status in ('published','closed'))
  union all select 'document:'||d.id::text,d.created_at,'documents','Documento incorporado',d.file_name,null,null,jsonb_build_object('category',d.category)
   from public.student_documents d where d.student_id=child.id and d.school_id=child.school_id and (admin or family)
  union all select 'receipt:'||r.id::text,r.created_at,'payments','Pago registrado',r.reference,null,null,jsonb_build_object('total',r.total,'method',r.payment_method)
   from public.school_receipts r where r.student_id=child.id and r.school_id=child.school_id and finance
  union all select 'care:'||r.id::text,(r.entry_date+r.occurred_at) at time zone 'America/La_Paz','care','Cuidado · '||r.kind,r.note,c.name,c.academic_year,jsonb_build_object('careKind',r.kind)
   from public.care_records r join public.classrooms c on c.id=r.classroom_id where r.student_id=child.id and r.school_id=child.school_id and (public.school_director(child.school_id) or public.may_edit_classroom(child.school_id,r.classroom_id) or family and academic)
  union all select 'request:'||r.id::text,r.created_at,'requests','Solicitud · '||r.type,r.reason,null,null,jsonb_build_object('status',r.status)
   from public.family_requests r where r.student_id=child.id and r.school_id=child.school_id and (admin or family or public.may_edit_classroom(child.school_id,child.classroom_id))
 ), selected as (select * from history where (p_kind='all' or kind=p_kind) and (p_from is null or "at">=p_from::timestamp at time zone 'America/La_Paz') and (p_to is null or "at"<(p_to+1)::timestamp at time zone 'America/La_Paz') and (p_cursor is null or ("at",key)<((p_cursor->>'at')::timestamptz,p_cursor->>'key')) order by "at" desc,key desc limit p_limit+1)
 select coalesce(jsonb_agg(to_jsonb(selected) order by "at" desc,key desc),'[]') into events from selected;
 more:=jsonb_array_length(events)>p_limit;
 select coalesce(jsonb_agg(value order by ordinality),'[]') into page from jsonb_array_elements(events) with ordinality where ordinality<=p_limit;
 last_row:=page->(jsonb_array_length(page)-1);
 return jsonb_build_object('studentId',child.id,'studentName',concat_ws(' ',child.first_name,child.last_name),'currentStatus',child.status,'years',coalesce((select jsonb_agg(y order by y desc) from (select distinct y.year y from public.enrollment_history h join public.academic_years y on y.id=h.year_id where h.student_id=child.id and h.school_id=child.school_id) years),'[]'),
 'events',page,'hasMore',more,'next',case when more then jsonb_build_object('at',last_row->>'at','key',last_row->>'key') end,'academicAvailable',academic,'financialAvailable',finance);
end $$;
revoke all on function public.student_kardex(uuid,date,date,text,jsonb,integer) from public,anon;
grant execute on function public.student_kardex(uuid,date,date,text,jsonb,integer) to authenticated;
