-- A family must default to an accessible year, even while staff prepare next year.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.timetable_workspace(uuid,uuid)'::regprocedure);
 if position('from public.academic_years where school_id=p_school_id order by year desc limit 1' in definition)=0 then raise exception 'No se encontró la selección de gestión esperada.';end if;
 definition:=replace(definition,'from public.academic_years where school_id=p_school_id order by year desc limit 1',
 'from public.academic_years y where y.school_id=p_school_id and (manager or exists(select 1 from public.classrooms accessible_room where accessible_room.school_id=p_school_id and accessible_room.academic_year=y.year and aulanexo_private.schedule_room_visible(accessible_room.id))) order by y.year desc limit 1');
 execute definition;
end $$;
