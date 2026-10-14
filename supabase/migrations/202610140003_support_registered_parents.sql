-- El propietario puede probar su propia cuenta familiar/docente si está realmente vinculada.
-- La entrada virtual sin asignación continúa existiendo únicamente para Dirección.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.support_accounts(uuid)'::regprocedure);
 definition:=replace(definition,'u.id<>auth.uid()','(u.id<>auth.uid() or m.role<>''director'')');
 execute definition;
 definition:=pg_get_functiondef('public.start_support_session(uuid,uuid,text,text)'::regprocedure);
 definition:=replace(definition,' or (p_user_id=auth.uid() and p_role<>''director'')','');
 definition:=replace(definition,'if p_user_id<>auth.uid() and not exists','if (p_user_id<>auth.uid() or p_role<>''director'') and not exists');
 execute definition;
 definition:=pg_get_functiondef('aulanexo_private.support_context()'::regprocedure);
 definition:=replace(definition,'if context.target_user_id<>auth.uid() and not exists','if (context.target_user_id<>auth.uid() or context.role<>''director'') and not exists');
 execute definition;
end $$;
