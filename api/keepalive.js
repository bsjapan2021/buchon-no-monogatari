// Supabase 무료 플랜은 7일간 활동이 없으면 프로젝트를 자동 일시정지한다(로그인·비밀번호 찾기 모두 중단).
// Vercel Cron이 하루 1회 이 함수를 호출해 DB에 가벼운 조회를 보내 활동을 유지한다. (vercel.json → crons)
export default async function handler(_req, res) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    res.status(500).json({ ok: false, error: "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 미설정" });
    return;
  }
  try {
    const r = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status, at: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err) });
  }
}
