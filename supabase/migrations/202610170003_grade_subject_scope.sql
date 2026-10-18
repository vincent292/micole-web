alter table public.grades add column class_subject_id uuid references public.class_subjects(id);
create index grades_class_subject on public.grades(class_subject_id) where class_subject_id is not null;
create function aulanexo_private.validate_grade_subject() returns trigger language plpgsql security definer set search_path='' as $$
declare child public.students;room public.classrooms;subject_name text;begin
 select * into child from public.students where id=new.student_id;select * into room from public.classrooms where id=child.classroom_id;
 if child.id is null or child.school_id<>new.school_id then raise exception 'La nota debe corresponder al estudiante y su institución.';end if;
 if auth.uid() is not null and not public.learning_can_manage(room.id,new.class_subject_id) then raise exception 'Solo Dirección o el docente de esta materia puede registrar la nota.';end if;
 if room.subjects_enabled and new.class_subject_id is null and (TG_OP='INSERT' or old.class_subject_id is not null) then raise exception 'Selecciona una materia del aula para registrar la nota.';end if;
 if new.class_subject_id is not null then
  select s.name into subject_name from public.class_subjects cs join public.school_subjects s on s.id=cs.subject_id where cs.id=new.class_subject_id and cs.classroom_id=child.classroom_id and cs.school_id=child.school_id and cs.active;
  if subject_name is null then raise exception 'La materia de la nota no pertenece al aula o está archivada.';end if;
  new.subject:=subject_name;
 else new.subject:=coalesce(nullif(trim(new.subject),''),'Desarrollo integral');end if;
 return new;
end $$;
revoke all on function aulanexo_private.validate_grade_subject() from public,anon,authenticated;
create trigger grade_subject_scope before insert or update on public.grades for each row execute function aulanexo_private.validate_grade_subject();
