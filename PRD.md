# PRD — ブチョンの物語 (Buchon no Monogatari)

오리지널 바다이야기풍 **파친코 확률 시뮬레이터 웹게임**. 회원 전용(로그인) + 관리자 콘솔 포함.

- Live: https://umimonogatari.vercel.app
- Repo: github.com/bsjapan2021/buchon-no-monogatari
- 최종 갱신: 2026-10-24

## 0. 원칙 (독창성 / IP)

- **오리지널 에셋만 사용.** 사용자 자체 브랜드 마스코트(DUOCE NANOHYDROIN 캐릭터 1~11, 피규어 omen 8·9, 소녀 캐릭터 premium omen1·2)만.
- 海物語 / 마루한 / ジンベェタイム / 沖海 등 **상표·유명 캐릭터·고유 연출명 금지.** 수치(확률 스펙)만 장르 공통으로 참조.
- 저작권: © 주식회사 나노하이드로인 · 여승훈(연구소장).
- 응답/표기 언어: 한국어 + 日本語 토글.

## 1. 기술 스택

- Vite + TypeScript(strict) + Canvas 2D + Web Audio API + Web Speech API.
- 백엔드: Supabase(Auth + Postgres + RLS). 지오IP: ipwho.is / ipapi.co.
- `npm run build` = `vite build`만 (타입체크는 `npx tsc --noEmit` 별도).
- 배포: GitHub push(keychain 토큰) → `vercel --prod --yes`.

## 2. 게임 플레이 / 물리 (`src/render/playfield.ts`)

- 좌하단 레일에서 구슬 발사 → 못(釘) 충돌·반동 → 중앙 **노란 포켓** 입상.
- **릴 회전은 포켓 입상 시에만 1회**(자동회전 없음). 보류(保留) 최대 **4**.
- 벽–못 간격 확보로 끼임 방지. 중앙 스플리터 + 유도 못.

## 3. 룰 엔진 (`src/render/outcome.ts`)

- 모드: 통상(NORMAL) / 確変(KAKUHEN) / 時短(JITAN) + RUSH 루프. 電サポ는 연출(색)에만 영향.
- **확률(현행)**: 통상/시단 당첨 6.5% → **오아다리(확변) ≈ 3.9%**, 리치(통상) ≈ 2.6%. 確変(RUSH) 당첨 50%.
- 당첨 종류: **홀수 = 오아다리(확변·빨강)**, **짝수 = 리치(통상·파랑)**. 라운드 10R≈1500구슬 / 2R≈60. 확변 비중 60%.
- 당첨 라인: **세로(열)·대각선만** (가로 없음). 릴은 **1→2행→3행 순차 슬라이딩 정지**(skip 압축 없음). 리치꽝(reachlose) 연출 포함.

## 4. 연출 (`src/render/game.ts`, `effects.ts`, `boars.ts`, `nuke.ts`, `symbols.ts`)

- **프리미엄 테마**: 리치 5종 + 오아다리 6종. 테마별 색·캐릭터·불꽃·충격파·분할. 매 당첨 랜덤.
  - **프리미엄 예감**(소녀 카드): 오아다리에 45%/리치에 8% → 뜨면 오아다리 기대도 MAX.
  - **お祈り(오이노리)**: 달님 기도 — 달 + 소녀 캐릭터.
- 공통 이펙트: 불꽃놀이, 충격파 링, 화면 분할, 플래시, 섬광(beam), 컷인, 화면 진동.
- **멧돼지 떼(오아다리)**: 누끼 딴 개별 멧돼지 스프라이트(큰어른/어른/새끼/어미+새끼)가 **한 마리씩 바닥에서 우→좌 질주**. 소형(화면 ~8–11%), 수 2배, **영상 끝날 때까지 계속 생성**. rembg로 pig.png에서 추출 → `src/assets/boars/wh_*.png`.
- **원자폭탄 폭발(오아다리 3연속 이상)**: 화면 중앙 섬광 → 불투명 화구 → 충격파 4겹 → 버섯구름 → 잔해 → 강진동. (연속 끊기면 리셋)
- 프리미엄 영상: 11.mp4(오아다리), 12.mp4(연속 리치 2+). iOS는 첫 발사 제스처에 `unlockVideos()`로 소리 사전해제.

## 5. 오디오 (`src/render/audio.ts`) — 전부 합성, 외부 음원 없음

- 상시 파친코장 앰비언스 + BGM. 릴 회전 = **경쾌한 음악(대음량)**, 멈추면 off.
- 리치예감: **번개(천둥) + 전기 감전음** + 순간 볼륨 부스트(깜짝).
- 멧돼지: 발굽 우르릉 + 꿀꿀/괴성 (질주 동안 반복).
- 핵폭발: 초저역 붐 + 서브 쿵 + 광대역 크랙 + 긴 럼블, 아주 큰 볼륨.
- Web Speech 음성(おおあたり 등).

## 6. UI / HUD / 레이아웃

- 전광판(스코어보드): 회전 · 구슬 · **보류** · 금일 리치 · 금일 오아다리 (릴 돌면 보류 즉시 −1).
- HUD: 계정 바(👤사용자 · 관리자콘솔 · 로그아웃) + 상태/모드 + 카운터 + 슬라이더 + 버튼(발사/스킵/음소거/언어).
- **구슬 박스 3단계**: 투명 1,000 → 빨강 3,000 → **녹색 10,000**. 양 사이드 동적 스택, 당첨 캐릭터 ×3 좌우 표시. 브랜드 "ブチョン".
- i18n KO/JA 토글. **모바일 가로 = 고정 1480×760 설계를 통째 축소(scale-to-fit)** → PC와 동일. 세로는 회전 안내.

## 7. 인증 / 회원 / 관리자 (`src/auth/*`, `supabase/schema.sql`)

- 스플래시(캐릭터 떠다니는 캔버스 애니) → 로그인 / 회원가입 / 비밀번호 찾기.
- **회원가입 = 관리자 승인 대기.** 승인된 회원만 게임 입장. 차단 시 자동 퇴장(폴링).
- **최고관리자**: kr.seunghunyeo@gmail.com (해당 이메일 가입 시 트리거가 자동 admin+승인; 비번은 Supabase Auth에 해시 저장).
- **관리자 콘솔(관리자만)**: 회원 승인/거부, **접속자 이름·IP·국적(🇰🇷 등)·접속 해지**. (#gate 밖 body에 렌더하여 항상 표시)
- 테이블: `profiles`(role/status/blocked) · `sessions`(ip/country/active) · `game_states`(jsonb). RLS 적용.
- **게임 상태 저장**: 구슬·회전·보류·리치·오아다리·모드 등을 5초 주기+이탈 시 저장 → 재접속 복원(회원=DB, 게스트=localStorage).
- 환경변수: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(.env + Vercel). 미설정 시 '임시 게스트 입장' 폴백.

## 8. 에셋

- `src/assets/char/1~11.png`(마스코트), `omen/8·9.png`(피규어), `boars/wh_*.png`(멧돼지 누끼), `11.mp4`/`12.mp4`(프리미엄 영상).
- `public/premium/omen1·2.png`(소녀 캐릭터, 런타임 로드).

## 9. 배포 체크리스트

1. `npx tsc --noEmit` → `npx vite build`
2. git commit/push (user bsjapan2021)
3. `vercel --prod --yes`
4. Supabase: `supabase/schema.sql` 적용, 관리자 계정 생성, Vercel env(URL/anon) 설정.
