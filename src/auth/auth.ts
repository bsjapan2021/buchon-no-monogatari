// 인증/회원/세션 로직 — Supabase Auth + profiles/sessions 테이블.
import { supabase, ADMIN_EMAIL } from "./supabase.js";

export interface Profile {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string; // pending | approved | rejected
  blocked: boolean;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string | null;
  email: string | null;
  name: string | null;
  ip: string | null;
  country: string | null;
  country_code: string | null;
  active: boolean;
  created_at: string;
  last_seen: string;
}

export interface Geo {
  ip: string;
  country: string;
  country_code: string;
}

function db() {
  if (!supabase) throw new Error("Supabase 미설정 (VITE_SUPABASE_URL/ANON_KEY)");
  return supabase;
}

export { ADMIN_EMAIL };

// ---- 인증 ----
export async function signUp(email: string, password: string, name: string): Promise<void> {
  const { error } = await db().auth.signUp({ email, password, options: { data: { name } } });
  if (error) throw error;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  try {
    await endMySession();
  } catch {
    /* 무시 */
  }
  await db().auth.signOut();
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await db().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
  if (error) throw error;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await db().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await db().auth.getUser();
  return data.user?.id ?? null;
}

export function onAuthChange(cb: () => void): void {
  db().auth.onAuthStateChange(() => cb());
}

// ---- 프로필 ----
export async function myProfile(): Promise<Profile | null> {
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await db().from("profiles").select("*").eq("id", uid).single();
  if (error) return null;
  return data as Profile;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase() === ADMIN_EMAIL;
}

// ---- 접속 세션 (IP/국적) ----
let mySessionId: string | null = null;

async function fetchGeo(): Promise<Geo> {
  try {
    const r = await fetch("https://ipwho.is/");
    const j = await r.json();
    if (j && j.success !== false) {
      return { ip: j.ip ?? "", country: j.country ?? "", country_code: j.country_code ?? "" };
    }
  } catch {
    /* 폴백 시도 */
  }
  try {
    const r = await fetch("https://ipapi.co/json/");
    const j = await r.json();
    return { ip: j.ip ?? "", country: j.country_name ?? "", country_code: j.country_code ?? "" };
  } catch {
    return { ip: "", country: "", country_code: "" };
  }
}

export async function startSession(profile: Profile): Promise<void> {
  const geo = await fetchGeo();
  const { data, error } = await db()
    .from("sessions")
    .insert({
      user_id: profile.id,
      email: profile.email,
      name: profile.name,
      ip: geo.ip,
      country: geo.country,
      country_code: geo.country_code,
      active: true,
    })
    .select("id")
    .single();
  if (!error && data) mySessionId = (data as { id: string }).id;
}

export async function heartbeat(): Promise<void> {
  if (!mySessionId) return;
  await db().from("sessions").update({ last_seen: new Date().toISOString() }).eq("id", mySessionId);
}

export async function endMySession(): Promise<void> {
  if (!mySessionId) return;
  await db().from("sessions").update({ active: false }).eq("id", mySessionId);
  mySessionId = null;
}

// ---- 관리자 기능 ----
export async function listMembers(): Promise<Profile[]> {
  const { data, error } = await db().from("profiles").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function setStatus(userId: string, status: "approved" | "rejected" | "pending"): Promise<void> {
  const { error } = await db().from("profiles").update({ status }).eq("id", userId);
  if (error) throw error;
}

export async function setBlocked(userId: string, blocked: boolean): Promise<void> {
  const { error } = await db().from("profiles").update({ blocked }).eq("id", userId);
  if (error) throw error;
  if (blocked) await db().from("sessions").update({ active: false }).eq("user_id", userId);
}

export async function listActiveSessions(): Promise<SessionRow[]> {
  // 최근 2분 내 하트비트만 '접속중'으로 간주.
  const since = new Date(Date.now() - 120000).toISOString();
  const { data, error } = await db()
    .from("sessions")
    .select("*")
    .eq("active", true)
    .gte("last_seen", since)
    .order("last_seen", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SessionRow[];
}
