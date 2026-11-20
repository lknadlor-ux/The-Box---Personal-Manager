create function public.box_drop_previews() returns table(path text, filename text, remaining_seconds integer, mime_type text, thumbnail text)
language sql stable security invoker set search_path='' as $$
 select o.name,coalesce(nullif(o.user_metadata->>'original_name',''),'File'),
 ceil(extract(epoch from (o.created_at+interval '10 minutes'-now())))::integer,
 o.metadata->>'mimetype',left(o.user_metadata->>'thumbnail',8192)
 from storage.objects o where o.bucket_id='box-file-drop' and (storage.foldername(o.name))[1]=(select auth.uid())::text and o.created_at>now()-interval '10 minutes' order by o.created_at desc
$$;
revoke all on function public.box_drop_previews() from public,anon;
grant execute on function public.box_drop_previews() to authenticated;