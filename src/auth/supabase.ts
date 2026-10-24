// Supabase 클라이언트 — 환경변수에서 URL/ANON KEY 를 읽는다.
// Vercel: 프로젝트 설정 → Environment Variables 에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 추가 후 재배포.
// 로컬: 프로젝트 루트에 .env 파일로 동일 키 지정.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const ADMIN_EMAIL = "kr.seunghunyeo@gmail.com";

export const supabaseConfigured = Boolean(URL && KEY);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
