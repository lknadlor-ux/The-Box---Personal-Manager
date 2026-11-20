create extension if not exists pg_cron;
create extension if not exists pg_net;
insert into storage.buckets (id,name,public,file_size_limit) values ('box-file-drop','box-file-drop',false,26214400);
create policy "File Drop upload" on storage.objects for insert to authenticated with check (bucket_id='box-file-drop' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "File Drop active downloads" on storage.objects for select to authenticated using (bucket_id='box-file-drop' and (storage.foldername(name))[1]=(select auth.uid())::text and created_at > now()-interval '10 minutes');
select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'box_file_drop_cleanup_token');
create function public.box_expired_drops(cleanup_token text) returns table(path text)
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from vault.decrypted_secrets where name='box_file_drop_cleanup_token' and decrypted_secret=cleanup_token) then
   raise exception 'Unauthorized' using errcode='42501';
 end if;
 return query select o.name from storage.objects o where o.bucket_id='box-file-drop' and o.created_at<=now()-interval '10 minutes' order by o.created_at limit 500;
end $$;
revoke all on function public.box_expired_drops(text) from public, anon, authenticated;
grant execute on function public.box_expired_drops(text) to service_role;
select cron.schedule('box-file-drop-cleanup','* * * * *',$job$
 select net.http_post(url:='https://tmohmufbytcpmefiiqzx.supabase.co/functions/v1/box-drop-cleanup',headers:=jsonb_build_object('Content-Type','application/json','x-cleanup-token',(select decrypted_secret from vault.decrypted_secrets where name='box_file_drop_cleanup_token')),body:='{}'::jsonb)
 where exists (select 1 from storage.objects where bucket_id='box-file-drop' and created_at<=now()-interval '10 minutes');
$job$);