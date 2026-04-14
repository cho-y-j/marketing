# 전면 리뉴얼 마스터 플랜

> **시작일**: 2026-04-14
> **목표**: 데이터 분석 툴 → 실행 중심 리드젠 퍼널로 전환
> **원칙**: CLI가 모든 작업 수행, 웹은 결과 뷰어
> **진행 규칙**: 새 세션 시작 시 이 파일을 먼저 읽고, 체크리스트 상태 확인 후 이어서 진행

---

## Phase 0: 기반 셋업
> DB 스키마 리뉴얼 + 슈퍼관리자 + 룰 관리

### 0-1. DB 스키마 리뉴얼
- [x] User 모델에 role 필드 추가 (INDIVIDUAL / FRANCHISE / SUPER_ADMIN)
- [x] User 모델에 status 필드 추가 (ACTIVE / SUSPENDED / DELETED)
- [x] User 모델에 phone, businessNumber(사업자번호), companyName 추가
- [x] FranchiseGroup 모델 신규 (가맹사업자 → 다중 매장 그룹)
- [x] Store 모델에 franchiseMembership 추가 (가맹점 소속)
- [x] KeywordRule 모델 신규 (업종별 키워드 룰 테이블)
- [x] BlogAnalysis 모델 신규 (블로그 상위노출 체크 결과)
- [x] ConsultationRequest 모델 신규 (상담 CTA 전환 추적)
- [x] StoreAnalysis에서 n1Score/n2Score/n3Score → 직관적 필드명 변경
- [x] prisma migrate 실행 및 검증
- [x] 기존 코드 n1/n2/n3 참조 모두 수정 (백엔드 + 프론트엔드)

### 0-2. 슈퍼관리자 백엔드
- [x] AdminGuard 생성 (role 기반, SUPER_ADMIN 체크)
- [x] admin 모듈 생성 (packages/api/src/modules/admin/)
- [x] 회원 목록 API (GET /admin/users) - 검색/필터/페이징
- [x] 회원 상세 API (GET /admin/users/:id) - 매장/가맹 정보 포함
- [x] 회원 수정 API (PATCH /admin/users/:id)
- [x] 회원 삭제 API (DELETE /admin/users/:id) - soft delete
- [x] 회원 정지 API (PATCH /admin/users/:id/suspend)
- [x] 회원 정지 해제 API (PATCH /admin/users/:id/activate)

### 0-3. 슈퍼관리자 프론트엔드
- [x] /admin 라우트 그룹 생성 (별도 레이아웃)
- [x] 관리자 사이드바/네비게이션 (회원관리/룰관리/상담신청)
- [x] 회원 목록 페이지 (테이블 + 검색 + 역할/상태 필터 + 페이징)
- [x] 회원 상세/수정 페이지 (인라인 편집 + 매장/가맹 정보)
- [x] 회원 정지/해제/삭제 (confirm 포함)

### 0-4. 룰 관리
- [x] 룰 CRUD API (GET/POST/PATCH/DELETE /admin/keyword-rules)
- [x] 업종별 키워드 룰 시드 데이터 작성 (13개 업종, 56개 룰)
  - [x] 소고기집(7), 삼겹살집(4), 밥집/한식(5), 카페(5), 일식(5), 중식(4)
  - [x] 치킨(3), 피자(3), 미용실(5), 네일(3), 병원(4), 헬스(4), 술집(4)
- [x] 룰 관리 페이지 (업종 필터 + 인라인 편집 + 추가/삭제)

---

## Phase 1: 가입 → 자동 분석 파이프라인
> 가입하자마자 30초 안에 "내 매장이 지금 여기" 를 보여주는 것

### 1-1. 가입/매장 등록 강화
- [x] 매장 등록 페이지 전면 리뉴얼 (URL or 매장명 1개만 입력)
- [x] 플레이스 미리보기 API (GET /stores/place-preview) → 자동 정보 수집
- [x] 미리보기 카드 UI (매장명, 카테고리, 주소, 방문자리뷰, 블로그리뷰, 저장수)
- [x] store-setup에 KeywordRule 기반 키워드 생성 추가 (룰=MAIN, AI=AI_RECOMMENDED)
- [ ] 회원가입 폼에 개인사업자/가맹사업자 선택 추가 (Phase 6에서 상세 구현)
- [ ] 고객이 원하는 키워드 직접 입력 (선택, 분석 대기 중 액션)
- [ ] 비교 경쟁업체 직접 추가 (선택, 분석 대기 중 액션)

### 1-2. 키워드 자동 생성 엔진 (CLI)
- [x] 매장 등록 완료 → store-setup.autoSetup 자동 트리거 (기존)
- [x] 업종 + 지역 → KeywordRule 테이블 조회 → 키워드 조합 생성 (신규)
- [x] AI 보완 키워드 생성 (기존) + 룰 키워드와 중복 제거
- [x] 생성된 키워드 DB 저장 (MAIN/AI_RECOMMENDED 구분)
- [x] 키워드별 월검색량 조회 (Naver SearchAD API, 기존)

### 1-3. 경쟁 업체 자동 탐지 (CLI)
- [x] 생성된 키워드로 네이버 플레이스 검색 → 상위 5개 매장 자동 수집 (기존 findCompetitors)
- [x] Competitor 모델에 AUTO 타입으로 저장 (기존)
- [x] 경쟁업체 기본 데이터 수집 강화 (리뷰수, 블로그수, placeId — store-setup에서 수집)
- [x] 고객 직접 추가 경쟁업체 검색 API (GET /stores/:id/competitors/search?name=)

### 1-4. 순위 체크 엔진 (CLI)
- [x] 키워드별 내 매장 순위 조회 (기존 RankCheckService.checkAllKeywordRanks)
- [x] 경쟁사 순위 역전 감지 + CompetitorAlert 자동 생성 (기존)
- [x] KeywordRankHistory에 일별 기록 저장 (기존)
- [x] CompetitorHistory에 일별 기록 저장 (기존 + store-setup 강화)
- [x] Bull Queue 기반 비동기 처리 (기존 RankCheckProcessor)

### 1-5. 초기 사용자 경험 (프론트엔드)
- [x] 매장 등록 직후 가이드형 초기 진단 화면 (기존 setup 페이지)
- [x] 분석 진행 단계별 UI (기존: 정보수집→키워드→경쟁사→분석→브리핑)
- [x] 분석 대기 중 할 수 있는 액션 추가 (키워드 추가, 경쟁업체 추가 버튼)
- [x] 분석 완료 → 대시보드로 이동 버튼 (기존)

---

## Phase 2: 대시보드 + 상세 분석 화면
> 한눈에 파악 + 상세 드릴다운

### 2-1. 대시보드 전면 재설계
- [x] 상단: 현재 상태 요약 (경쟁력 높음/보통/낮음 + 평균 순위 + 핵심 수치 4개)
- [x] 부족점 진단 (리뷰 부족/순위 낮음/블로그 부족 자동 판단 + 심각도 + 현재값 vs 목표값)
- [x] 오늘 해야 할 액션 3가지 (카드 버튼 + 근거 데이터 + 페이지 링크)
- [x] 키워드별 내 순위 테이블 (순위 색상 코딩 + 변동 + 월검색량)
- [x] 경쟁사 비교 테이블 (내 매장 vs 경쟁사 리뷰/블로그 + 차이)
- [x] 대시보드 종합 API (GET /stores/dashboard/:storeId) 1회 호출로 전체 데이터
- [ ] 가맹사업자용: 전체 가맹점 현황 한눈에 보기 (Phase 6)

### 2-2. 키워드 순위 페이지 (애드로그 스타일)
- [x] 키워드별 일별 순위 추이 그리드 테이블 (RankGridTable 컴포넌트)
- [x] 순위 색상 코딩 (1~5위 진한파랑, 6~10위 파랑, 11~30위 빨강, 31위~ 검정)
- [x] 7일/14일/30일 기간 선택 버튼
- [x] 날짜별 변동 표시 (▲▼ + 숫자)
- [x] 기존 Recharts 순위 추이 차트 유지
- [ ] 경쟁사 순위 비교 (Phase 4 블로그 엔진 이후 통합)

### 2-3. 매장 분석 페이지 재설계
- [x] "문제 → 원인 → 해결" 3-STEP 구조로 전면 재설계
- [x] STEP 1 현재 상태: 경쟁력 높음/보통/낮음 + 평균 순위 + 4대 지표(리뷰/블로그/저장/경쟁사)
- [x] STEP 2 문제 원인: 자동 진단 (리뷰 부족/순위 낮음/블로그 부족) + 심각도 + N배 차이 표시
- [x] STEP 3 해결 방향: 문제별 구체적 액션 카드 + 해당 페이지 링크
- [x] 경쟁사 대비 상세 비교 테이블 (리뷰/블로그 + N배 뒤처짐 표시)
- [x] N1/N2/N3 용어 완전 제거 (Phase 0-1에서 완료)

### 2-4. 경쟁 비교 페이지
- [ ] 내 매장 vs 경쟁업체 비교 테이블
- [ ] 항목: 순위, 방문자리뷰, 블로그리뷰, 저장수, 월검색량
- [ ] 경쟁사별 추이 차트
- [ ] 경쟁사 알림 (순위 역전, 리뷰 급증 등)

---

## Phase 3: 마케팅 로직 엔진
> CLI가 자동 판단하여 "지금 뭘 해야 하는지" 추천

### 3-1. 기본 체력 판단
- [x] 4단계 마케팅 단계 자동 판단 (REVIEW_FIRST → TRAFFIC_NEEDED → OPTIMIZATION → MAINTENANCE)
- [x] 리뷰 30개 미만 → 리뷰 최우선 단계
- [x] 대시보드에 마케팅 단계 배너 표시

### 3-2. 트래픽 판단
- [x] 리뷰 있는데 순위 50위 밖 → 트래픽 유입 단계 자동 전환
- [x] 키워드 순위 체크 + 블로그 콘텐츠 액션 자동 추천

### 3-3. 업종별 키워드 전략 분기
- [x] 키워드별 검색량 대비 순위 분석 → 집중 키워드 / 포기 키워드 구분
- [x] keywordStrategy 결과를 대시보드에 전달

### 3-4. "오늘의 액션" 엔진
- [x] 마케팅 단계별 + 문제 기반 액션 자동 생성 (우선순위 정렬, 상위 3개)
- [x] 각 액션에 reason(근거 데이터) 포함
- [x] 대시보드 액션 카드에 근거 표시

---

## Phase 4: 블로그 상위노출 엔진
> 의뢰자가 "가장 중요한 부분"이라 강조한 기능

### 4-1. 블로그 노출 체크 (CLI)
- [x] 키워드별 네이버 블로그 검색 → 상위 10개 수집 (BlogAnalysisService)
- [x] 상위 블로그 문서 수집 (제목, 작성일, 블로그명, URL)
- [x] 반복 노출 블로그 탐지 (경쟁사명 매칭)
- [x] 경쟁 강도 분석 (LOW/MEDIUM/HIGH/VERY_HIGH, 최근 30일 비율 기준)

### 4-2. 상위노출 판단 (CLI)
- [x] 최근 30일 작성 블로그 비율 계산
- [x] 경쟁 매장명 반복 언급 카운트
- [x] 플레이스 연결 문맥 존재 여부 체크
- [x] BlogAnalysis 모델에 결과 upsert 저장

### 4-3. 키워드별 전략 추천
- [x] PUSH(공략) / HOLD(유지) / SKIP(포기) / DONE(이미 상위) 4종 자동 판단
- [x] 각 판단에 대한 reason(근거) 자동 생성
- [x] 요약 API (GET /stores/:id/keywords/blog-analysis) — push/hold/skip/done 카운트

### 4-4. 블로그 분석 프론트엔드
- [x] BlogAnalysisCard 컴포넌트 (키워드 페이지에 통합)
- [x] 키워드별 전략 뱃지 + 경쟁 강도 + 블로그 수/최근 비율/경쟁사 수
- [x] PUSH 키워드 하이라이트 + 근거 표시
- [x] 분석 실행 버튼 (POST /stores/:id/keywords/blog-analysis)

---

## Phase 5: 메뉴 구조 재편 + 부가 기능

### 5-1. 메뉴 재편 (분석 → 실행 → 결과)
- [x] 사이드바 4개 그룹 재편 (홈/내 매장 상태/마케팅 실행/성과 확인)
- [x] 관리자 메뉴 링크 추가
- [x] 외국인 상권 메뉴 추가

### 5-2. 외국인 상권 진단
- [x] 안내 페이지 (구글 지도+검색+리뷰 구조 설명 + 체크 포인트)
- [x] CTA 버튼 3종 (무료 진단/가능성 확인/유입 체크)
- [x] CTA 클릭 → ConsultationCTA 컴포넌트로 상담 폼 표시

### 5-3. 전문 상담 CTA
- [x] ConsultationCTA 재사용 컴포넌트 (이름/연락처/메시지 폼)
- [x] POST /stores/consultation API (ConsultationRequest 저장)
- [x] 매장 분석 페이지 하단에 CTA 연결 (문제 있을 때만)
- [x] 관리자 상담 목록 API (GET /admin/consultations + 상태 변경)

### 5-4. 생성형 AI 작업 (API Key 기반)
- [x] callWithUserKey 개선 — 고객 키 우선, 없으면 서비스 키 폴백
- [x] 기존 anthropicApiKey 필드 활용 (DB에 이미 있음)
- [ ] 블로그 글 생성 시 고객 키 연결 (콘텐츠 모듈에서 호출 시 적용)
- [ ] 리뷰 댓글 생성 시 고객 키 연결 (리뷰 모듈에서 호출 시 적용)

---

## Phase 6: 가맹사업자 전용 기능

### 6-1. 가맹 그룹 관리
- [ ] FranchiseGroup CRUD API
- [ ] 가맹점 일괄 등록 (엑셀 업로드 등)
- [ ] 가맹점 소속 관리

### 6-2. 가맹 대시보드
- [ ] 전체 가맹점 현황 요약 (순위 분포, 리뷰 현황)
- [ ] 부족한 가맹점 자동 하이라이트
- [ ] 가맹점별 드릴다운 → 개인사업자와 동일한 상세 화면

---

## 진행 로그
| 날짜 | 작업 내용 | Phase |
|------|----------|-------|
| 2026-04-14 | 마스터 플랜 작성, CLAUDE.md 생성, 메모리 셋업 | 준비 |
| 2026-04-14 | Phase 0-1 DB 스키마 리뉴얼 완료 (User role/status, FranchiseGroup, KeywordRule, BlogAnalysis, ConsultationRequest, N1/N2/N3 직관적 명칭 변경) | 0-1 완료 |
| 2026-04-14 | Phase 0-2 슈퍼관리자 백엔드 완료 (AdminGuard, 회원 CRUD/정지/해제 API, 타입체크+빌드 통과) | 0-2 완료 |
| 2026-04-14 | Phase 0-3 슈퍼관리자 프론트엔드 완료 (/admin 라우트, 회원 목록/상세/수정 페이지) | 0-3 완료 |
| 2026-04-14 | Phase 0-4 룰 관리 완료 (CRUD API + 13업종 56룰 시드 + 관리 페이지) | 0-4 완료 |
| 2026-04-14 | Phase 1 가입→자동분석 파이프라인 완료 (매장등록 리뉴얼, 룰기반 키워드생성, 경쟁사 데이터강화, 대기중 액션) | 1 완료 |
| 2026-04-14 | Phase 2-1 대시보드 전면 재설계 완료 (현위치+부족점+액션+순위+경쟁비교 한 화면) | 2-1 완료 |
| 2026-04-14 | Phase 2-2 키워드 순위 페이지 완료 (일별 그리드 테이블+색상코딩+변동표시) | 2-2 완료 |
| 2026-04-14 | Phase 2-3 매장 분석 페이지 완료 (문제→원인→해결 3-STEP + 경쟁사 비교) | 2-3 완료 |
| 2026-04-14 | Phase 3 마케팅 로직 엔진 완료 (4단계 판단+키워드전략+근거 액션) | 3 완료 |
| 2026-04-14 | Phase 4 블로그 상위노출 엔진 완료 (네이버 블로그 검색+경쟁강도+PUSH/SKIP 전략) | 4 완료 |
| 2026-04-14 | Phase 5 메뉴재편+상담CTA+외국인상권+AI키분기 완료 | 5 완료 |
| 2026-04-14 | GitHub push 완료 (3커밋, 57파일, +5,090줄) — 자동 배포 진행 중 | 배포 |
| 2026-04-14 | **중간 점검** — 아래 상세 기록 | 점검 |

---

## 중간 점검 (2026-04-14)

### 빌드/타입 검수 결과
| 항목 | 결과 |
|------|------|
| API 백엔드 TypeScript 타입 체크 | **통과** |
| Web 프론트엔드 TypeScript 타입 체크 | **통과** |
| NestJS 빌드 (nest build) | **통과** |
| DB 마이그레이션 적용 | **통과** (24개 테이블) |
| 키워드 룰 시드 데이터 | **통과** (13업종 56룰) |

### 변경 파일 목록 (30개)
**수정 (14개):**
- `packages/api/prisma/schema.prisma` — User role/status, FranchiseGroup, KeywordRule, BlogAnalysis 등 추가
- `packages/api/src/app.module.ts` — AdminModule 등록
- `packages/api/src/modules/analysis/place-index.service.ts` — n1/n2/n3 → trafficScore/engagementScore/satisfactionScore
- `packages/api/src/modules/competitor/competitor.controller.ts` — 경쟁사 검색 API 추가
- `packages/api/src/modules/store/store.controller.ts` — 대시보드 API + 플레이스 미리보기 API
- `packages/api/src/modules/store/store.module.ts` — DashboardService 등록
- `packages/api/src/providers/data/store-setup.service.ts` — KeywordRule 기반 키워드 생성 + 경쟁사 데이터 수집 강화
- `apps/web/app/(dashboard)/page.tsx` — 대시보드 전면 재설계
- `apps/web/app/(dashboard)/analysis/page.tsx` — 문제→원인→해결 3-STEP 재설계
- `apps/web/app/(dashboard)/keywords/page.tsx` — RankGridTable 추가
- `apps/web/app/(dashboard)/stores/new/page.tsx` — URL 미리보기 기반 매장 등록
- `apps/web/app/(dashboard)/stores/setup/page.tsx` — 대기 중 액션 추가
- `apps/web/hooks/useStore.ts` — address/subCategory 타입 추가

**신규 (16개):**
- `CLAUDE.md` — 프로젝트 전체 맥락
- `plan.md` — 마스터 플랜 + 체크리스트
- `packages/api/src/common/guards/admin.guard.ts` — AdminGuard (role 기반)
- `packages/api/src/modules/admin/` — admin.module + admin-user.controller/service + admin-rule.controller/service
- `packages/api/src/modules/store/dashboard.service.ts` — 대시보드 종합 데이터 서비스
- `packages/api/prisma/seed-keyword-rules.ts` — 업종별 키워드 룰 시드
- `packages/api/prisma/migrations/20260414_phase0_schema_renewal/` — DB 마이그레이션
- `apps/web/app/(admin)/` — 관리자 레이아웃 + 회원관리 + 룰관리 페이지
- `apps/web/components/admin/admin-sidebar.tsx` — 관리자 사이드바
- `apps/web/components/keywords/rank-grid-table.tsx` — 일별 순위 그리드
- `apps/web/hooks/use-admin.ts` — 관리자 회원 관리 hooks
- `apps/web/hooks/use-admin-rules.ts` — 관리자 룰 관리 hooks
- `apps/web/hooks/useDashboard.ts` — 대시보드 종합 데이터 hook

### 의뢰자 피드백 대비 진행률

| # | 의뢰자 요구사항 | 상태 | 비고 |
|---|----------------|------|------|
| 1 | 서비스 방향: 실행 중심 | ✅ | 대시보드 "오늘 해야 할 것" 중심 |
| 2 | 대시보드 재구성 | ✅ | 상태요약+부족점+액션+순위+비교 |
| 3 | 매장 분석 문제→원인→해결 | ✅ | 3-STEP 구조 완료 |
| 4 | 초기 사용자 경험 | ✅ | URL 1개 입력 → 자동수집 → 단계별 UI |
| 5 | 메뉴 구조 정리 | ⬜ | Phase 5 |
| 6 | 마케팅 로직 (체력/트래픽/키워드) | 🔶 | 부족점 진단은 구현, 상세 엔진은 Phase 3 |
| 7 | 블로그 상위노출 엔진 | ⬜ | Phase 4 (의뢰자 핵심) |
| 8 | 외국인 상권 진단 | ⬜ | Phase 5 |
| 9 | 슈퍼관리자 + 룰 관리 | ✅ | 완료 |
| 10 | 개인/가맹사업자 구분 | 🔶 | DB 구조 완료, UI는 Phase 6 |
| 11 | N1/N2/N3 직관적 표현 | ✅ | trafficScore/engagementScore/satisfactionScore |

### 미완료 항목 (다음 세션 우선순위)
1. **Phase 3: 마케팅 로직 엔진** — 체력판단/트래픽판단/오늘의 액션 자동 생성
2. **Phase 4: 블로그 상위노출 엔진** — 의뢰자가 가장 강조한 기능
3. **Phase 5: 메뉴 재편 + 외국인 상권 + 상담 CTA**
4. **Phase 6: 가맹사업자 전용 기능**
5. **Phase 2-4: 경쟁 비교 페이지 상세** (순위/추이 차트/알림)
6. **Phase 1-1 잔여**: 회원가입 폼 개인/가맹 선택, 키워드/경쟁사 직접 추가 UX
