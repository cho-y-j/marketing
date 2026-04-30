# Marketing Intelligence Platform

## 프로젝트 개요
자영업자(개인사업자 + 가맹사업자) 대상 네이버 플레이스 마케팅 분석 플랫폼.
가입 즉시 매장 현위치 파악 → 부족점 인식 → 전문 상담(광고 유치) 연결하는 리드젠 퍼널.

## 아키텍처
```
[웹 프론트엔드] ← 결과 표시만 (뷰어)
       │
[NestJS API] ← 인증/라우팅
       │
[CLI 엔진 (Bull Queue)] ← 모든 실제 작업 수행
  ├─ 자동: 순위 체크, 경쟁사 분석, 키워드 생성, 블로그 노출 체크
  ├─ 고객 요청: 웹에서 요청 → CLI가 신규 발동
  └─ 생성형 AI: Claude CLI (호스트 nvm 마운트) — 고객 API Key 우선
       │
[PostgreSQL + Redis] → 결과 저장 → 웹 조회
```

- 웹은 단순 뷰어. 분석/수집/처리는 전부 CLI(백엔드)가 담당
- **Claude CLI를 컨테이너에 볼륨 마운트**하여 컨테이너 안에서 `claude -p` 실행
- AI 응답은 Redis 캐싱 (1시간 TTL, 데이터 hash 키)
- 고객이 API Key를 넣으면 생성형 작업은 고객 키로 작동

## 회원 유형
- **개인사업자 (INDIVIDUAL)**: 단일 매장
- **가맹사업자 (FRANCHISE)**: 전체 가맹점 한눈에 + 개별 매장은 개인과 동일
- **슈퍼관리자 (SUPER_ADMIN)**: 회원 관리 + 키워드 룰 관리 + 상담 신청 처리

## 기술 스택
- **Monorepo**: pnpm workspace + Turborepo
- **Frontend**: Next.js 16 (React 19, App Router), shadcn/ui, Tailwind, Zustand, React Query, Recharts
- **Backend**: NestJS 10, Prisma ORM, PostgreSQL, Redis (IORedis), Bull Queue
- **AI**: Claude CLI (host mount), Claude API SDK, OpenAI (fallback)
- **External APIs**: Naver SearchAD, Naver Place (private), Naver SmartPlace
- **Auth**: JWT + Passport.js + NextAuth.js + Naver OAuth
- **Scraping**: axios + 네이버 Place API 병렬 호출 (Chrome/playwright 불필요 — 2026-04-22 제거)
- **Font**: Paperlogy (로컬, 한글 geometric sans, weight 400/500/600/700)

## 운영 환경 (중요 — 서버 = 이 개발자 머신)
- **URL**: `http://1.221.158.115:3200` (외부), `http://localhost:3200` (로컬 동일)
- **컨테이너/포트** (docker compose):
  - `mk_web` (Next.js) — 호스트 3200 → 내부 3000
  - `mk_api` (NestJS) — 호스트 4000 → 내부 4000
  - `mk_postgres` — 호스트 **5433** → 내부 5432 (로컬 psql 접속 시 5433)
  - `mk_redis`, `mk_mongodb`
  - `watchtower` — GHCR `:latest` 폴링 → 자동 pull/재시작
- **배포 플로우**: `git push origin main` → GitHub Actions `build-api`/`build-web` → GHCR `:latest` 푸시 → Watchtower 감지 → 컨테이너 교체. `deploy` step (SCP)는 SSH 시크릿 미설정으로 항상 실패하나 Watchtower 가 대체하므로 무관.
- **즉시 배포 확인**: `docker exec watchtower /watchtower --run-once --cleanup mk_api mk_web`
- **배포 검증 3단** (롤백/반영 확인):
  ```bash
  git log --oneline -3
  docker inspect mk_api --format='{{.Image}}'
  docker manifest inspect ghcr.io/cho-y-j/marketing-api:latest | grep digest | head -1
  ```
  커밋/digest 3개가 같은 흐름이면 반영 완료.
- **Next.js 청크 캐시**: `next.config.js` 의 `headers()` 로 `/_next/static/*` 에 `Cache-Control: public, max-age=0, must-revalidate` 강제 (Turbopack 청크 파일명 재사용 이슈 회피).

## 디자인 시스템 (Apple 70% + 한글 30% 타협)
상세 사양: `DESIGN-apple.md §10 Adaptation`

- **단일 액센트**: `#0071e3` (Apple Blue) — 링크/버튼/포커스 링만
- **배경**: 대시보드 `#f5f5f7` 고정. 검정 섹션은 랜딩/가입 히어로에만.
- **폰트**: `var(--font-sans)` = Paperlogy. `letter-spacing: -0.018em` / `line-height: 1.55` / `word-break: keep-all`. 헤드라인은 `-0.022em` / `1.25`.
- **CTA radius**: 기본 8px. `980px` pill 은 "더보기"류 보조 링크 한정.
- **터치 타겟**: 모바일 44px 최소, 아이콘 버튼 36px 최소 (padding + `-margin` 기법).
- **정보 밀도**: Apple 여백의 ~50% (카드 패딩 16~20px, 섹션 32~48px). 대시보드는 숫자 밀도 유지.
- **증감 표시**: `+12`(녹) `-3`(빨) `±0`(회). 추정치는 `~` 접두사 + (필요 시) 노란 배지.

## 반응형 규칙
- **390px (iPhone 13 mini)** 필수 통과 — 가로 스크롤 0, 모든 터치 타겟 36px+
- **768px (iPad mini)** 중간 확인 — 사이드바 전환점
- **1280px (MacBook 13)** 데스크탑 기준
- 헤드리스 검증: `playwright` 로 `document.documentElement.scrollWidth - window.innerWidth === 0` 확인
- 테이블은 `md:block hidden`, 모바일은 카드 리스트 (`md:hidden`)

## 네비게이션 구조 (2026-04-22 확정)
- **사이드바(데스크탑)**: 홈 / 내 매장 상태(매장 분석·경쟁매장) / 마케팅 실행(키워드·콘텐츠·리뷰·시즌 이벤트) / 성과 확인(리포트·원가·외국인) / 설정 / 관리자
- **MobileNav(모바일 하단)**: 홈 · 키워드 · 경쟁 · 리뷰 · **더보기**
  - "더보기" = 하단 시트 — 사이드바 전체 메뉴(매장 등록/관리자 포함) 2열 그리드
- **TopBar**: 로고 아이콘만(모바일) + StoreSwitcher(flex-1) + 알림벨(44px) + UserMenu 드롭다운(로그아웃 포함)
- **레이아웃 규칙**: dashboard layout `flex-1 flex flex-col min-w-0` 필수 (내용이 viewport 넘치는 것 방지)

## 프로젝트 구조
```
apps/web/                   # Next.js 프론트엔드 (뷰어)
packages/api/               # NestJS 백엔드 + CLI 엔진
packages/shared/            # 공유 타입/유틸
packages/eslint-config/
packages/typescript-config/
adlog/                      # 레퍼런스 HTML (애드로그 화면 참고용, gitignored)
.claude/                    # 메모리 (gitignored)
```

## 핵심 페이지 구조

```
사이드바
├─ 홈
│  └─ 오늘 해야 할 것 (대시보드)
├─ 내 매장 상태
│  ├─ 매장 분석 (문제→원인→해결 3-STEP)
│  └─ 경쟁 비교 (격차 시각화 + 진단)
├─ 마케팅 실행
│  ├─ 키워드 (Top 3 + 내 위치 카드 + 상세 페이지)
│  ├─ 콘텐츠
│  ├─ 리뷰 관리
│  └─ 시즌 이벤트
├─ 성과 확인
│  ├─ 리포트
│  └─ 외국인 상권
├─ 설정
└─ 관리자 (슈퍼관리자만)

상단 매장 선택 (StoreSwitcher) — 매장 1개여도 표시 + "+ 새 매장 추가"
```

## 데이터 매칭 표준 (2026-04-30 — 룰 명시화)
같은 패턴의 버그가 반복돼서 정리: "수집은 다 됐는데 매칭/룰이 코드와 어긋나서 UI 미표시". 
**새 데이터 소스 추가하거나 변동 표시 추가 시 이 표를 따른다.**

### A. 수집 원천 (Single Source of Truth)
| 데이터 | 테이블 | 수집 잡 (한국 시각) | 키 |
|---|---|---|---|
| 내 매장 visitor/blog 누적 | `StoreDailySnapshot` | DailySnapshotJob 13:00 | `(storeId, date)` |
| 등록 경쟁사 6명 visitor/blog | `CompetitorDailySnapshot` | DailySnapshotJob 13:00 | `(storeId, competitorPlaceId, date)` |
| 키워드별 Top70 매장 + 각 매장의 visitor/blog | `KeywordRankHistory.topPlaces` | RankCheck 13:30 | `(storeId, keyword, snapshotDate)` |
| 키워드 검색량 일별 | `KeywordDailyVolume` | KeywordManagement 월 13:20 | `(keyword, date)` |
| KAMIS 가격 | `IngredientPrice` | IngredientPriceJob 13:50 | — |

**중복 수집 금지**: pcmap SSR 1회 호출에 visitor/blog 함께 옴 → `KeywordRankHistory.topPlaces` 가 자동 누적 데이터셋. 별도 매장 API 호출 X.

### B. 매칭 우선순위 (변동 계산 시 반드시 이 순서)
1. **내 매장** (`isMine=true`) → `StoreDailySnapshot` (실측, 정밀)
2. **등록 경쟁사 6명** → `CompetitorDailySnapshot` (실측, 정밀)
3. **그 외 모든 Top70 매장** → `KeywordRankHistory.topPlaces` 폴백 (같은 placeId 의 N일전 카운트)
4. 셋 다 없으면 `null` → UI 미표시 (또는 "비교없음" 칩)

### C. 시간 기준 룰 (절대로 바꾸지 말 것)
- **1일 = 어제** = `오늘 자정 이전 마지막 row` (latest의 직전 row 가 아님)
- **7일/30일** = `N일 전 ± 12시간 윈도우`
- **달력 임의 날짜** = `그 날 00:00 ~ 23:59 가장 최근 row`
- **모든 cron** = UTC 기준 표현식, **한국 13:00~13:50 사이 실행** (사장님 PC ON 시간)

### D. 자연 마이그레이션 룰 (모든 누적 테이블 공통)
- 컬럼: `snapshotDate DATE` + `isEstimated BOOLEAN DEFAULT false`
- Unique: `(주체, 키, snapshotDate)` (예: `(storeId, keyword, snapshotDate)`)
- **백필 INSERT**: `isEstimated=true`, upsert 의 `update={}` (실측을 백필이 덮지 않음)
- **실측 INSERT**: `isEstimated=false`, upsert 의 `update={..., isEstimated:false}` (추정→실측 덮어쓰기)
- 결과: 시간이 지날수록 추정→실측 자연 마이그레이션

### E. UI 표시 룰
- 페이지 헤더 **반드시** "마지막 체크/갱신: 오늘 14:35" 표시 (사용자가 데이터 시점 알 수 있게)
- 변동 칩: `null` → "비교없음" 회색 / `0` → "변동없음" 회색 / `>0` → 색 (D컨벤션) / `<0` → 색
- 색 — visitor/blog 증감: 양수=빨강, 음수=파랑 (한국 주식식)
- 색 — 순위 변동: 좋아짐(낮은 숫자)=파랑, 나빠짐(높은 숫자)=빨강
- "1일/7일/30일/날짜선택" 토글 — `(어제)` 같은 부연 X (당연하므로)

### F. 새 변동 표시 추가 시 체크리스트
1. 매칭 키 = placeId? storeId? snapshotDate? — A 표 참조
2. 우선순위 1→2→3→null 폴백 구현했나 — B 룰
3. 시간 윈도우 — C 룰
4. 새 누적 테이블이면 isEstimated/snapshotDate/upsert — D 룰
5. UI 헤더에 "마지막 ..." 시각 + 비교없음/변동없음 칩 — E 룰

## 핵심 플로우
```
1. 가입 → 플레이스 URL 입력 → 매장 정보 자동 수집
2. 카테고리+지역 → AI(Claude CLI) + 룰 → 키워드 자동 생성
3. AI 키워드 상위 3개로 경쟁 업체 자동 탐지 (search.naver.com HTML)
4. CLI가 자동 분석:
   - Place API: 리뷰/블로그/저장수
   - 검색광고 API: 월/주/일 검색량
   - 순위 체크: Top 50 매장 (5개씩 병렬 배치)
   - 블로그 상위노출 분석
5. 마케팅 엔진: 4단계 자동 판단 + AI 액션 보강
6. 대시보드: 부족점 진단 + 오늘의 액션 (구체적 숫자 + 단계 + 예상효과)
7. 키워드 상세: Top 50 매장 + N일전 비교 + 인사이트
8. 부족점 인식 → "전문 상담 받기" CTA → 광고 계약
```

## 주요 기능

### 슈퍼관리자
- 회원 목록/상세/수정/정지/삭제
- 키워드 룰 관리 (13업종 56룰 시드)
- 상담 신청 목록

### 고객 화면
- **대시보드**: 마케팅 단계 + 부족점 + AI 액션 3개 (아코디언) + 순위 + 경쟁비교
- **매장 분석**: 문제→원인→해결 3-STEP + 경쟁사 N배 차이
- **경쟁 비교**: 격차 막대바 + 1:1 진단 (압도/우위/혼재/추격/심각)
- **키워드**: 카드별 Top 3 매장 + 내 위치 + 일/주/월 검색량
- **키워드 상세**: Top 10 경쟁 매트릭스 + N일전 비교 + 자동 인사이트
- **블로그 상위노출**: PUSH/HOLD/SKIP/DONE 4종 추천
- **외국인 상권 진단**: 안내 + CTA 3종 → 상담

### CLI 엔진 (백엔드 자동)
- 매장 등록 시: AI 키워드 → 검색량 배치 조회 → 경쟁사 탐지 → Place API 데이터 수집
- 정기: 순위 체크 (Bull Queue, 매일)
- 요청 시: 블로그 상위노출 분석
- AI 액션: 매장 컨텍스트 → Claude → 구체적 권장 (캐시 1시간)

## 개발 규칙
- 한국어 UI, 코드는 영어
- N1/N2/N3 같은 전문 용어 → 직관적 한국어 표현
- DB 마이그레이션: `npx prisma migrate dev`
- 컴포넌트: shadcn/ui 기반
- API: NestJS 컨벤션 (Controller → Service)
- **새 기능 추가 시 "CLI가 어떻게 실행하는가" 부터 설계**
- 자동 수집 불가능한 데이터는 솔직하게 UI에서 제거 (saveCount 등)
- 사장님 친화적 UX: 추상적 명령 X, 구체적 숫자 + 단계 + 예상 효과

## 네이버 API 대응 패턴 (중요)
오늘 발견한 비공개 API 변경 + 차단 패턴:

| 문제 | 해결 |
|------|------|
| Place API 응답 구조 변경 | `data.placeDetail.*` 중첩 파싱 |
| 경쟁사 placeId 획득 | search.naver.com HTML 정규식 추출 |
| 주소 파싱 (B동 = 건물동) | 한 글자/숫자 동 제외 |
| 검색광고 API 응답 0개 | 5개씩 배치 + 쉼표 제거 |
| 검색량 "< 10" string | parseVolume 헬퍼 |
| rate limit 429 | 풍부한 브라우저 헤더 (sec-ch-ua, Accept-Language) |
| isMine 매칭 오인식 | placeId 정확 일치만 |
| saveCount 자동 수집 | 불가 (SmartPlace OAuth만 가능) |

## 순위 수집 — pcmap 단발 호출 (2026-04-27 근본 재설계)
1주일간 모든 currentRank=NULL 오염의 원인이 된 m.search.naver.com 경로의 3중 결함 (display=5 하드코딩, start 파라미터 SSR 무효, 좌표 누락 시 서울 default) 을 폐기하고 pcmap 으로 전환.

- **엔드포인트**: `https://pcmap.place.naver.com/restaurant/list?query=K&x=mapx&y=mapy&display=70`
- **한 번 호출에 70개** + visitor/blog/save/category/좌표 모두 풍부 필드 (Place API 추가 호출 불필요)
- **start/page 파라미터는 SSR 에 무효** — Top 70 가 단발 한계. 그 너머는 service worker 우회 GraphQL 이 필요한데 페이지에서 캡쳐 불가 (현재 비현실적)
- **좌표 필수**: `Store.mapx/mapy` 누락 시 서울 default 로 답이 와서 결과 오염 → `reliable=false` 로 마킹하고 currentRank 안 덮어씀
- **MAX_RANK = 70**. UI 라벨 "70위 밖" 으로 통일. CLAUDE.md "Top 300" 약속 폐기
- 호출처: `naver-rank-checker.provider.ts` (`checkPlaceRank`, `fetchTopPlaces`) — 모두 mapx/mapy 시그니처 받음

## 30일 백필 + 매일 cron 마이그레이션 (사장님 설계)
신규 매장도 즉시 7일/30일 변동 칸이 살아있어야 함. 매일 1회 cron 이 추정값을 진짜 측정으로 자연 마이그레이션.

- **백필 대상 3종**: `StoreDailySnapshot` (내 매장), `CompetitorDailySnapshot` (경쟁사 6명), `KeywordRankHistory` (키워드 N개)
- **추정 알고리즘** (`competitor-backfill.service.ts`):
  - visitor: Place API 최근 100건 리뷰 → 각 작성일에 +1 (실관측). 100건 너머는 누적/365일 = 일평균 가상 속도로 분배 (최근일 가중치↑)
  - blog: 네이버 블로그 검색 sort=date 100건의 postdate 파싱 → 동일
  - 30일 전 누적 = 오늘 누적 - 그날부터 오늘까지 일별 발행 합 (역산)
  - 추정 row 는 `isEstimated=true` 마킹
  - **순위(rank) 자체는 추정 불가** — KeywordRankHistory 백필은 오늘 측정값을 30일 전까지 복제만
- **매일 cron** (`DailySnapshotJob` 01:00):
  - upsert 의 `update` 절에 `isEstimated: false` 명시 → 추정값을 진짜 측정으로 덮어쓰며 플래그도 false 로
  - 7일 누적 후엔 30일 중 7일이 실측, 23일이 추정
- **매장 등록 순서 (중요)**: 1) AI 키워드+검색량 → 2) 경쟁사 수집 → 3) 분석 → 4) **백필 먼저 (어제 row 생성)** → 5) **첫 스냅샷 (오늘 row + 어제 비교 → delta 정상)** → 6) 키워드 순위 백필 → 7) 첫 브리핑

## 변동량 표시 — 색 컨벤션 + 가중치 (2026-04-27 사장님 룰)
- **색 (visitor/blog 증감)**: **양수 = 빨강, 음수 = 파랑, ±0 = 회색** (한국 주식식). 내 매장이라도 동일 (리뷰 삭제 등 감소 케이스 있음). isMine 분기 제거
- **색 (순위 변동)**: 좋아짐 (5위→3위) = 파랑, 나빠짐 = 빨강. 별개 룰
- **`~` 추정 마크 제거**: 사장님 룰 — 추정·실측 구분 없이 동일 표기
- **기간 토글 통일**: `/keywords` 1일/7일/30일, `/keywords/[keyword]` 1/7/30일 + 달력(임의 날짜), `/competitors` day/week/month/date
- **변동률 가중치 (정석)** (`/competitors` `getStatus`):
  - 급증: rate ≥ 경쟁사 평균 × 1.5  AND  delta ≥ 5
  - 활발: rate ≥ 경쟁사 평균       AND  delta ≥ 3
  - 평온: rate ≥ 0
  - 감소: rate < 0
  - 작은 매장 부풀림 방지 (rate 비율 + 평균 대비 + 절대값 하한 = 외식업 SaaS 표준)
- **delta 데이터 소스**: visitor/blog 증감은 `StoreDailySnapshot` / `CompetitorDailySnapshot` 직접 비교 (KeywordRankHistory.topPlaces 의 visitor/blog 는 백필이 같은 값 복제이므로 신뢰 X)

## 작업 관리
- **마스터 플랜**: `plan.md` — 전체 Phase 체크리스트 + 진행 로그
- **메모리**: `.claude/projects/-home-cho-pro-marketing/memory/` — 의뢰자 피드백, 비즈니스 모델, 결정사항

## 세션 시작 시 필수 확인
1. `plan.md` 읽기 → 현재 진행 위치 파악
2. 미완료 항목부터 이어서 작업
3. 작업 완료 시 즉시 plan.md 체크 + 진행 로그 추가

## 레퍼런스
- `adlog/` 디렉토리: 애드로그(adlog.kr) 화면 HTML 21+개 파일
  - **데이터 구조/기능만 참고** — 디자인은 우리 shadcn/Tailwind 독자 설계
  - 핵심 참고: 키워드 순위 비교, 블로그 분석, 히든키워드, 유입통계
