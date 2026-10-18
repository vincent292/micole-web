-- Activation amounts are configurable; validation messages must not quote Bs 50.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','aulanexo_private') and p.prosrc like '%La activación de Bs 50 sigue pendiente.%' loop
  definition:=replace(pg_get_functiondef(f.oid),'La activación de Bs 50 sigue pendiente.','La activación de MiCole sigue pendiente.');execute definition;
 end loop;
end $$;
