import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

export function withTimeout(promise, label = "요청", ms = 12000) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) =>
      setTimeout(() => resolve({
        data: null,
        error: { message: `${label} 시간이 초과되었습니다. 네트워크/RLS/권한을 확인하세요.`, code: "CLIENT_TIMEOUT" },
      }), ms)
    ),
  ]);
}

export async function rpc(name, params = {}, label = name, ms = 12000) {
  return await withTimeout(db.rpc(name, params), label, ms);
}
