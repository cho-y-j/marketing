# Phase 10 실행 체크리스트 (정공법 검수용)

> **용도**: 매 작업 세션마다 읽고 체크. 작업 전·중·후 증거를 이 파일에 기록.
> **원칙**: 체크박스 [x] 처리는 **4단 검수(단위/통합/UI/배포)** 모두 통과해야만 가능.
> **금지**: mock 데이터, TODO 주석 남기기, try/catch 로 실패 삼키기, 마이그레이션 skip
> **시작 전 필독**: `feedback-2026-04-24.md §7 정공법 개발 원칙`

---

## 현재 진입 Phase: **Phase 10-A + 10-A' (병행)**
진입일: **2026-04-24**
예상 완료일: 2026-04-30
의뢰자 최종 설계 리뷰 완료일: 2026-04-24 (대화 내 구두 확정)

---

## Phase 10-A 진입 전 체크포인트

- [x] 의뢰자에게 본 문서 공유 + 최종 설계 리뷰 받음 (2026-04-24 대화 내 구두 확정)
- [x] **DB 백업 완료** — `/tmp/backup-pre-phase10a-20260424-115446.sql` (119KB)
  - 대상: `Competitor`, `StoreKeyword`, `CompetitorHistory`, `CompetitorDailySnapshot`
  - 실행 명령: `docker exec mk_postgres pg_dump -U admin -d marketing_intelligence -t '"Competitor"' -t '"StoreKeyword"' -t '"CompetitorHistory"' -t '"CompetitorDailySnapshot"' > /tmp/backup-pre-phase10a-...`
  - ⚠️ 계정: `admin / marketing_intelligence` (postgres X)
- [x] 테스트 매장 3개 준비 완료 — DB에 이미 존재:
  - [x] 시나리오 A: `찬란한아구 공덕직영점` (cmnynv9t40001te0128qabx00) — 아귀찜/마포구 도화동 ✅
  - [x] 시나리오 B: `홍홍대패` (cmoaxf1k800ocqv01hum9aoln) — 육류/청원구 오창읍 (지방) ✅
  - [x] 시나리오 C: `가헌생갈비 목동본점` (cmoa3ejr1008sqv01z5apvgxc) — 육류/양천구 목동 ✅
  - 전체 현황: 매장 6개, 경쟁사 26개, 키워드 58개
- [x] **롤백 포인트 기록**: `897986f` (docs: plan.md + CLAUDE.md — 2026-04-22 세션 작업 로그)
  - 현재 작업 트리 untracked: `feedback-2026-04-24.md`, `phase-10-checklist.md`, `개방데이터_활용매뉴얼(국문)/`
- [x] **영향 파일 전수 파악 완료** — 20개 파일 수정 대상:
  - Backend: `store-setup.service.ts`, `competitor-finder.service.ts`, `competitor.service.ts`, `competitor.controller.ts`, `competitor.dto.ts`, `competitor-refresh.job.ts`, `competitor-backfill.service.ts`, `daily-snapshot.service.ts`, `daily-snapshot.job.ts`, `dashboard.service.ts`, `marketing-engine.service.ts`, `analysis.service.ts`, `briefing.service.ts`, `blog-analysis.service.ts`, `rank-check.service.ts`, `notification.service.ts`
  - Frontend: `competitors/page.tsx`, `competitor-radar-chart.tsx`, `competitor-alert-card.tsx`, `competitor-summary.tsx`, `useCompetitors.ts`, `useROI.ts`

---

## Phase 10-A 세부 태스크

### A-1. AI 프롬프트에 `primaryKeyword` 필수 필드 추가
**파일**: `packages/api/src/providers/data/store-setup.service.ts:808~893`

**작업 전**
- [ ] 현재 프롬프트 전문 복사 (롤백용) → 여기에 추가: `______`
- [ ] AI 응답 JSON 샘플 받아보기 (수동 1회 실행)

**작업 내용**
- [ ] `analysis` 객체에 `primaryKeyword: string` 필드 추가
- [ ] 프롬프트에 선정 기준 명시: "실제 사용자가 메뉴 미정 상태에서 처음 검색할 확률 가장 높은 키워드 1개"
- [ ] 예시 3개 모두 `primaryKeyword` 포함하게 수정

**검수**
- [ ] ① 단위: 테스트 매장 A로 `generateSmartKeywords` 직접 호출 → 로그에 `primaryKeyword: "공덕 맛집"` 출력 확인
  - 실제 로그: `______`
- [ ] ② 통합: 매장 A 등록 → `docker logs mk_api -f` 로 프롬프트/응답 전문 확인
- [ ] ③ UI: 해당 없음
- [ ] ④ 배포: 해당 없음 (아직 커밋 X)

---

### A-2. `primaryKeyword` → `type: "MAIN"` 저장 + 10개 미만 cap
**파일**: `store-setup.service.ts:282~300`

**작업 전**
- [ ] 현재 `storeKeyword.type` enum 값 확인 (`prisma/schema.prisma`)

**작업 내용**
- [ ] 키워드 저장 루프에서 `kw === aiResponse.primaryKeyword` 이면 `type: "MAIN"`
- [ ] 저장 후 최종 키워드 수 `count >= 10` 이면 초과분 삭제 (MAIN은 보호)
- [ ] 로그 출력: `키워드 N개 확정, MAIN=공덕 맛집`

**검수**
- [ ] ① 단위: `psql` 로 `SELECT keyword, type FROM "StoreKeyword" WHERE "storeId"='xxx'` → MAIN 정확히 1개
  ```sql
  SELECT type, COUNT(*) FROM "StoreKeyword" WHERE "storeId"='TEST_ID' GROUP BY type;
  ```
  - 결과: `______`
- [ ] ② 통합: 매장 A/B/C 각각 등록 → 모두 MAIN 1개 + 총 개수 < 10
- [ ] ③ UI: `/keywords` 페이지에서 MAIN 키워드 배지 노출 (없으면 UI 작업 필요)
- [ ] ④ 배포: 스킵 (A-3 까지 묶음 커밋)

---

### A-3. `pickCompetitorQueries` 볼륨 필터 제거 + MAIN 보장
**파일**: `store-setup.service.ts:130~219`

**작업 전**
- [ ] 현재 로직 이해: `monthlySearchVolume > 0` 조건이 있는 라인 (135~144) 메모

**작업 내용**
- [ ] 볼륨 필터 제거 — MAIN 키워드는 볼륨 0이어도 **첫 쿼리**로 강제 포함
- [ ] 나머지 쿼리는 볼륨 DESC 정렬 유지
- [ ] 최소 1개 쿼리 보장 (MAIN 존재 시 1개는 반드시 나옴)

**검수**
- [ ] ① 단위: 검색광고 API mock 으로 "모든 키워드 볼륨 0" 반환 → `pickCompetitorQueries` 여전히 1개 이상 반환
  - 테스트 결과: `______`
- [ ] ② 통합: 매장 B (지방, 검색량 희박)로 등록 → 경쟁사 쿼리 최소 1개 이상 실행됨
- [ ] ③ UI: 해당 없음
- [ ] ④ 배포: 스킵

---

### A-4. `Competitor.competitionType` DB 마이그레이션
**파일**: `packages/api/prisma/schema.prisma`

**작업 전**
- [ ] DB 백업 완료 확인 (진입 체크포인트 §)
- [ ] 현재 `Competitor` 모델 전문 복사

**작업 내용**
- [ ] `schema.prisma` 에 enum + 필드 추가:
  ```prisma
  enum CompetitionType {
    EXPOSURE
    DIRECT
    BOTH
  }
  model Competitor {
    ...
    competitionType CompetitionType @default(DIRECT)
  }
  ```
- [ ] `npx prisma migrate dev --name add_competition_type` 실행
- [ ] 기존 레코드는 `DIRECT` 로 디폴트 (마이그레이션 SQL 확인)

**검수**
- [ ] ① 단위: `\d+ "Competitor"` 로 컬럼 존재 + 기본값 확인
  ```bash
  docker exec mk_postgres psql -U postgres marketing -c '\d+ "Competitor"' | grep competitionType
  ```
  - 결과: `______`
- [ ] ② 통합: 기존 매장의 Competitor 레코드 전수 `DIRECT` 확인
  ```sql
  SELECT "competitionType", COUNT(*) FROM "Competitor" GROUP BY "competitionType";
  ```
- [ ] ③ UI: Prisma Studio 로 시각적 확인
- [ ] ④ 배포: **이 단계에서 커밋 + 푸시** — 마이그레이션은 반드시 배포 전 DB 반영되게
  - 커밋 hash: `______`
  - 배포 digest 일치 확인: `______`

---

### A-5. 2-레이어 경쟁사 수집 로직 (핵심)
**파일**: `store-setup.service.ts:1120~1252` (`findCompetitorsByQueries` 재설계)

**작업 전**
- [ ] A-1~A-4 완료 확인
- [ ] 현재 `findCompetitorsByQueries` 전문 백업

**작업 내용**
- [ ] 함수를 2개 stage 로 재구성:
  - Stage 1: MAIN 키워드 단독 검색 Top 10 → 업종 필터 **OFF** → `EXPOSURE` 저장
  - Stage 2: 메뉴 키워드(2~3개) → Top 수집 → 업종 필터 **ON** → `DIRECT` 저장
- [ ] 중복 매장은 `competitionType: "BOTH"` 로 upsert
- [ ] AI 재선별(`aiSelectCompetitors`)은 DIRECT 에만 적용 (EXPOSURE 는 Top 10 무조건 포함)

**검수**
- [ ] ① 단위: 매장 A 로 실행 → 로그에 `[EXPOSURE] 10개 수집 / [DIRECT] 6개 선별` 출력
- [ ] ② 통합: DB 조회로 EXPOSURE/DIRECT/BOTH 분포 확인
  ```sql
  SELECT "competitionType", "competitorName" FROM "Competitor"
  WHERE "storeId"='TEST_A' ORDER BY "competitionType";
  ```
- [ ] ③ UI: 아직 탭 미구현 → 스킵 (A-6에서 확인)
- [ ] ④ 배포: A-6 묶어서

---

### A-6. 경쟁 비교 화면 탭 2개
**파일**: `apps/web/app/(dashboard)/competitors/page.tsx`

**작업 전**
- [ ] 현재 경쟁 비교 페이지 스크린샷 저장 (변경 전 증거)

**작업 내용**
- [ ] 탭 UI 추가: "공덕 상권 강자" (EXPOSURE+BOTH) / "같은 업종 경쟁" (DIRECT+BOTH)
- [ ] 각 탭별 쿼리 분리
- [ ] 중복(BOTH) 매장은 양 탭 모두 표시
- [ ] 모바일 390px 가로 스크롤 0 검증

**검수**
- [ ] ① 단위: API `/competitors?storeId=X&type=EXPOSURE` 응답 10개
- [ ] ② 통합: 매장 A 에서 탭 전환 시 데이터 다르게 나옴
- [ ] ③ UI:
  - [ ] 데스크탑(1280px) 스크린샷 저장
  - [ ] 모바일(390px) 스크린샷 저장
  - [ ] playwright 로 `scrollWidth - innerWidth === 0` 확인
- [ ] ④ 배포: 커밋 + 푸시 + digest 일치 + 실서버 접속 확인

---

## Phase 10-A' (셋업 진행 UI 강화) 세부 태스크

### A'-1. 매장명 입력 모드 버그 진단 (F1 원문)
**파일**: `apps/web/app/(dashboard)/stores/new/page.tsx` + `stores/place-preview` API

**작업 전**
- [ ] 실제 재현: `http://1.221.158.115:3200/stores/new` 에서 "공덕맛집" 같은 매장명 입력 → 결과 관찰
- [ ] 재현된 증상: `______`

**작업 내용** (진단 결과에 따라)
- [ ] ...진단 후 결정

**검수**: 4단 전부 통과 요구

---

### A'-2 ~ A'-6
(진행 UI 강화 — 백엔드 로그 서브텍스트 노출, 진행률 바, 예상시간, 실시간 결과 미리보기, 인사이트 카드, 요약 3문장)

작업 전 별도 설계 확정 세션 필요. 진행 시 이 체크리스트 섹션에 동일 포맷으로 확장.

---

## Phase 10-A 완료 체크포인트 (모두 필수)

- [ ] A-1 ~ A-6 모두 4단 검수 통과
- [ ] TODO 주석 0건 확인
  ```bash
  grep -rn "TODO\|FIXME\|XXX" packages/api/src/providers/data apps/web/app/\(dashboard\)/competitors
  ```
- [ ] 완료 조건(DoD) 충족 확인:
  - [ ] 신규 매장 등록 → 30초 내 "공덕 맛집 Top 10"이 EXPOSURE로 저장됨
  - [ ] 경쟁 비교 탭에서 "상권 강자 / 같은 업종" 두 군 표시
- [ ] 의뢰자에게 완료 보고 + 실기기 핵심 플로우 확인 요청
- [ ] `plan.md` 진행률 업데이트 (Phase 10-A 체크)
- [ ] 본 체크리스트 해당 박스 [x] 처리
- [ ] 롤백 스크립트 보관 (Phase 10-B 이후 필요 시)

---

## 세션 종료 시 기록

세션 종료 전 반드시 아래 3줄 채우기:

- **완료 태스크**: `______`
- **미완료/블로커**: `______`
- **다음 세션 첫 액션**: `______`

---

## 검수 증거 보관

스크린샷/로그/쿼리 결과는 `.claude/evidence/phase-10/` 디렉토리에 저장 (gitignored):
- `a-1-ai-response.json` (AI primaryKeyword 응답)
- `a-4-migration-diff.sql` (DB 마이그레이션)
- `a-6-before.png` / `a-6-after.png` (UI 전후)
- `a-6-mobile.png` (모바일 스크린샷)
