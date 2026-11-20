import { createClient } from "npm:@supabase/supabase-js@2";
Deno.serve(async (req) => {
  const token = req.headers.get("x-cleanup-token");
  if (req.method !== "POST" || !token || token.length !== 72) return new Response(null,{status:403});
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error} = await client.rpc("box_expired_drops",{cleanup_token:token});
  if (error) return new Response(null,{status:error.code==="42501"?403:500});
  if (data.length) {
    const result = await client.storage.from("box-file-drop").remove(data.map((row:{path:string})=>row.path));
    if (result.error) return new Response(null,{status:502});
  }
  return Response.json({removed:data.length});
});