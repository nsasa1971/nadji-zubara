revoke execute on function public.audit_trigger() from anon, authenticated, public;
revoke execute on function public.is_verified_owner(text) from anon, public;
grant execute on function public.is_verified_owner(text) to authenticated;
