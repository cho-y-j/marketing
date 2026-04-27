# 전면 리뉴얼 마스터 플랜

> **시작일**: 2026-04-14
> **목표**: 데이터 분석 툴 → 실행 중심 리드젠 퍼널로 전환
> **원칙**: CLI가 모든 작업 수행, 웹은 결과 뷰어
> **진행 규칙**: 새 세션 시작 시 이 파일을 먼저 읽고, 체크리스트 상태 확인 후 이어서 진행

---

## 전체 진행률 (2026-04-15 기준)

```
Phase 0: 기반 셋업                    ████████████ 100%
Phase 1: 가입→자동 분석 파이프라인     ████████████ 100%
Phase 2: 대시보드 + 상세 분석 화면     ███████████░  95%
Phase 3: 마케팅 로직 엔진             ████████████ 100%
Phase 4: 블로그 상위노출 엔진          ████████████ 100%
Phase 5: 메뉴 재편 + 부가 기능         ████████████ 100%
Phase 6: 가맹사업자 전용              ░░░░░░░░░░░░   0%
Phase 7: 키워드 경쟁 매트릭스 + AI 액션 ████████████ 100%
Phase 8: 일별 스냅샷 + 속도 기반 재설계 ███████████░  90%  ← 의뢰자 최신 피드백
Phase 9: 키워드 품질 검증 & 매장명 변형 집계 ████████████ 100%  ← 의뢰자 재강조 (2026-04-15)
```

---

## Phase 0: 기반 셋업
> DB 스키마 리뉴얼 + 슈퍼관리자 + 룰 관리

### 0-1. DB 스키마 리뉴얼 ✅
- [x] User 모델에 role 필드 추가 (INDIVIDUAL / FRANCHISE / SUPER_ADMIN)
- [x] User 모델에 status 필드 추가 (ACTIVE / SUSPENDED / DELETED)
- [x] User 모델에 phone, businessNumber, companyName 추가
- [x] FranchiseGroup 모델 신규 (가맹사업자 → 다중 매장 그룹)
- [x] Store 모델에 franchiseMembership 추가
- [x] KeywordRule 모델 신규 (업종별 키워드 룰 테이블)
- [x] BlogAnalysis 모델 신규
- [x] ConsultationRequest 모델 신규
- [x] StoreAnalysis: n1/n2/n3 → trafficScore/engagementScore/satisfactionScore
- [x] prisma migrate 실행 및 검증
- [x] 기존 코드 n1/n2/n3 참조 모두 수정

### 0-2. 슈퍼관리자 백엔드 ✅
- [x] AdminGuard (role 기반)
- [x] 회원 CRUD/정지/해제 7개 API
- [x] admin/keyword-rules CRUD API

### 0-3. 슈퍼관리자 프론트엔드 ✅
- [x] /admin 라우트 그룹 + 별도 사이드바
- [x] 회원 목록 (검색/필터/페이징)
- [x] 회원 상세/수정 페이지

### 0-4. 룰 관리 ✅
- [x] 키워드 룰 13개 업종 56개 시드 데이터
- [x] 룰 관리 페이지 (인라인 편집)

---

## Phase 1: 가입 → 자동 분석 파이프라인
> 가입하자마자 30초 안에 "내 매장이 지금 여기" 를 보여주는 것

### 1-1. 가입/매장 등록 강화 ✅
- [x] 매장 등록 페이지 — URL 또는 매장명 1개만 입력
- [x] 플레이스 미리보기 API (자동 정보 수집)
- [x] 미리보기 카드 UI

### 1-2. 키워드 자동 생성 엔진 ✅
- [x] AI(Claude CLI) 우선 + 룰 보완
- [x] 풍부한 컨텍스트 투입 (매장명/주소/카테고리/지명힌트/메뉴분해/리뷰수)
- [x] "공덕 아귀찜" 같은 실전 키워드 생성 (마케터 수준)

### 1-3. 경쟁 업체 자동 탐지 ✅
- [x] AI 키워드 상위 3개로 다중 쿼리 탐색
- [x] search.naver.com HTML에서 placeId 추출
- [x] Place API로 리뷰/블로그 데이터 자동 수집

### 1-4. 순위 체크 엔진 ✅
- [x] 검색 API 폴백 (Chrome 없이도 동작)
- [x] placeId 정확 매칭으로 isMine 판정 (이름 부분 매칭 X)
- [x] Top 50까지 확장 + 5개 배치 병렬

### 1-5. 초기 사용자 경험 ✅
- [x] 단계별 진행 UI
- [x] 분석 대기 중 액션 (키워드/경쟁사 추가)

---

## Phase 2: 대시보드 + 상세 분석 화면

### 2-1. 대시보드 전면 재설계 ✅
- [x] 상단: 경쟁력 등급 + 평균 순위 + 핵심 4지표
- [x] 부족점 진단 (자동 + 심각도 + 격차 표시)
- [x] **오늘 해야 할 것 (AI 보강 + 캐싱 + 아코디언)**
- [x] 키워드별 내 순위 (currentRank 우선 정렬)
- [x] 경쟁사 비교 테이블 (방문자/블로그/일조회)
- [x] 마케팅 단계 배너 (REVIEW_FIRST / TRAFFIC_NEEDED / OPTIMIZATION / MAINTENANCE)

### 2-2. 키워드 페이지 ✅
- [x] **키워드 카드 — Top 3 매장 + 내 위치 한 카드에**
- [x] 일/주/월 검색량 표시
- [x] 검색량 미리보기 후 추가하는 흐름
- [x] 키워드 클릭 → 상세 페이지 이동
- [x] 블로그 분석 카드 통합

### 2-3. 매장 분석 페이지 ✅
- [x] 문제 → 원인 → 해결 3-STEP 구조
- [x] 4지표 (방문자/블로그/일조회/경쟁사)
- [x] 경쟁사 대비 N배 차이 표시
- [x] 전문 상담 CTA 연결

### 2-4. 경쟁 비교 페이지 ✅
- [x] **격차 시각화 — 막대바 + 진단 문장**
- [x] 매장별 1:1 비교 카드 (압도/우위/혼재/추격/심각)
- [x] 격차 카드 3종 (방문자/블로그/검색량)
- [x] 1위 경쟁사 표시

---

## Phase 3: 마케팅 로직 엔진 ✅
- [x] 4단계 마케팅 단계 자동 판단
- [x] 자동 진단: 리뷰/순위/블로그/검색량0/1위격차/키워드부족
- [x] 키워드 전략 분기 (집중/포기 자동 구분)
- [x] **AI 액션 보강 (구체적 숫자 + 단계별 가이드 + 예상 효과)**
- [x] **Redis 캐싱 1시간 (AI 호출 최소화)**

---

## Phase 4: 블로그 상위노출 엔진 ✅
- [x] 키워드별 네이버 블로그 검색 (BlogAnalysisService)
- [x] 경쟁 강도 분석 (LOW/MEDIUM/HIGH/VERY_HIGH)
- [x] PUSH/HOLD/SKIP/DONE 4종 전략 자동 추천
- [x] 키워드 페이지에 BlogAnalysisCard 통합

---

## Phase 5: 메뉴 + 외국인 상권 + 상담 CTA + AI 키 ✅
- [x] **사이드바 4개 그룹 재편** (홈/내 매장 상태/마케팅 실행/성과 확인)
- [x] **"내 매장" 메뉴 제거** (StoreSwitcher 강화로 대체)
- [x] StoreSwitcher: 매장 1개여도 표시 + "+ 새 매장 추가" 링크 통합
- [x] 외국인 상권 진단 페이지 (CTA 3종)
- [x] ConsultationCTA 재사용 컴포넌트 + 백엔드 API
- [x] AIProvider.callWithUserKey 개선 (고객 키 우선)

---

## Phase 7: 키워드 경쟁 매트릭스 + AI 액션 ✅
- [x] **Claude CLI 컨테이너 마운트** (host nvm + .claude 설정 read-only)
- [x] AI 키워드 생성 고도화 (전문가 수준 프롬프트)
- [x] 키워드별 경쟁 매트릭스 수집 (Top 50 + placeId + 리뷰 데이터)
- [x] /keywords/[keyword] 상세 페이지 (Top 10/N일전 비교/추이/인사이트)
- [x] 키워드 리스트 카드에 1위~3위 + 내 위치 표시

---

## 외부 API 대응 (네이버 비공개 API 변경 이슈)

오늘 발견한 문제와 해결책 — 향후 같은 패턴 발생 시 참고:

| # | 문제 | 해결 |
|---|------|------|
| 1 | Place summary API 응답 구조 변경 | `data.placeDetail.*` 중첩 구조 파싱 |
| 2 | 경쟁사 placeId 획득 불가 | search.naver.com HTML에서 id+name 정규식 추출 |
| 3 | 주소 파싱 (B동 건물동을 행정동으로 오인식) | 한 글자/숫자 동 제외 |
| 4 | 검색광고 API 응답 0개 | 5개씩 배치 분할 + 쉼표 제거 |
| 5 | 검색량 "< 10" 같은 string 응답 | parseVolume 헬퍼 (절반 추정) |
| 6 | search.naver.com rate limit (429) | 풍부한 브라우저 헤더 (sec-ch-ua, Accept-Language 등) |
| 7 | isMine 매칭 오인식 ("공덕직영점" 공통 단어) | placeId 정확 일치만 사용 |
| 8 | saveCount 자동 수집 불가능 | UI에서 컬럼 완전 제거 (SmartPlace OAuth 외 방법 없음) |

---

## 인프라 결정사항

- **Claude CLI 컨테이너 사용**: 호스트 `~/.nvm` + `~/.claude` 볼륨 마운트 → 컨테이너에서 `claude -p` 호출 가능
- **AI 캐싱**: Redis (CacheService) 1시간 TTL — 데이터 hash 기반 키 (자동 무효화)
- **Top 50 매장 수집**: 5개씩 병렬 배치 — Place API rate limit 회피 + 빠름

---

## 남은 Phase

### Phase 8: 일별 스냅샷 + 속도 기반 재설계 (의뢰자 최신 피드백, 최우선)

**핵심 방향 전환**: 누적 수치 중심(정적) → 일별 변화량 + 추이 중심(동적)

#### 8-1. 데이터 인프라 (일별 스냅샷)
- [ ] `StoreDailySnapshot` 모델 (storeId, date, visitorReviewCount, blogReviewCount, ...)
- [ ] `CompetitorDailySnapshot` 모델 (추적 경쟁사 매장별 일별)
- [ ] `KeywordDailyVolume` 모델 (keyword, date, pc, mobile, total)
- [ ] Bull Queue 일별 스냅샷 수집 Job (자정 이후, rate limit 고려 배치)
- [ ] 최소 10일 보관 (권장 30~90일)
- [ ] 마이그레이션

#### 8-2. 서비스 계층 리팩터 (delta 반환)
- [ ] 리뷰/검색량 반환 구조: `{ current, yesterday, delta, last7DaysAvg }`
- [ ] 경쟁 비교: 일 생성량 기준, 차이값(`-12`/`+8`) 반환
- [ ] 키워드 검색량: 어제 vs 오늘 (`어제 1,000 / 오늘 800`)
- [ ] 10일 추이 시계열 데이터 포인트 API

#### 8-3. 매장 분석 재설계 (/analysis)
- [ ] **누적 비교 폐기**
- [ ] "상위 1~10등 일평균 발행량 vs 내 매장" 비교 카드
- [ ] 방문자/블로그 각각 일평균 표시
- [ ] **키워드별 내 순위 리스트** (공덕맛집 2위, 공덕역맛집 5위 형태)
- [ ] 진단 신규: `BEHIND_DAILY_GENERATION`

#### 8-4. 경쟁 비교 재설계 (/competitors) ✅
- [x] 누적 리뷰 비교 → 일평균 발행량 비교로 전환
- [x] 경쟁사 정렬: 누적 순 → 일평균 리뷰 발행량 순
- [x] 차이값 표시 (`-12`, `+8`)
- [x] 누적 수치는 상단 1회 요약으로

#### 8-5. 대시보드 UI (/) ✅
- [x] 리뷰 카드: `1,563 (+23 오늘)` 형태
- [x] 키워드 카드: `어제 1,000 → 오늘 800 (-200)` 형태
- [x] 10일 스파크라인 추가 (리뷰 증가, 검색량 추이)

#### 8-6. AI 키워드 생성 프롬프트 교체 + UI
- [ ] 의뢰자 공식 프롬프트로 교체 (지역+역 조합, 유입/상황/메뉴 3카테고리, 10개 이하, 방문 의도)
- [ ] 후처리: 월 300 미만 필터 (회식 키워드 예외)
- [ ] **키워드 수동 추가 UI** (상견례/룸식당 등 매장별 편차)
- [ ] **키워드 제외 UI** + 제외 기록 저장 (재생성 시 재노출 방지)
- [ ] 매장명 변형 합산 집계 (브랜드+지역, 브랜드+역 등)

#### 8-7. 외국인 상권 페이지 재설계 (/foreign-market)
- [ ] CTA 문구 교체: "외국인 유입 진단 신청" → **"구글 광고 유입 상담 신청"**
- [ ] 서브 카피: "매장 정보 남겨주시면 바로 적용 가능한 광고 방향 안내드립니다."
- [ ] 포지셔닝: SEO 진단 툴 → 구글 광고 유입 리드젠
- [ ] 5가지 진단 체크리스트 UI:
  1. 구글 지도 등록 정확도
  2. 리뷰/평점 활성도
  3. 다국어 리뷰 구조 (자동 번역 포함)
  4. 외국인 키워드 노출
  5. 상권 위치 적합성
- [ ] "구글 순위는 사용자/위치별 상이" 안내 문구

---

### Phase 9: 키워드 품질 검증 & 매장명 변형 집계 (의뢰자 재강조)

**배경**: 의뢰자가 "육목원(소고기집)" 예시로 정확한 출력 형태를 재지정.
기대 출력(강남 맛집/강남역 맛집/강남역 소고기/강남 소고기/강남 회식/강남역 회식/뱅뱅사거리맛집)처럼
지역+유입 / 지역역+유입 / 지역+메뉴 / 지역역+메뉴 / 지역+상황 / 지역역+상황 / 주변상권+유입 패턴이
실제로 생성되는지 실증 필요.

#### 9-1. 실증 테스트 결과 (2026-04-15) ✅

**현재 DB 키워드 29개 분석**:
- ✅ `공덕 맛집` (21,430), `공덕 해물찜` (300), `공덕 회식` (480) — 양호
- ❌ **의뢰자 기대 키워드 누락**:
  - `공덕역 맛집` (없음) — 지역+역 조합 쌍이 안 나옴
  - `공덕 점심 맛집` / `공덕역 점심 맛집` (없음) — 상황 키워드 부족
- 🚨 **월 300 미만 다수 잔존** (회식 아닌데도):
  - `마포구 도화동 점심/백반/혼밥/한식` (각 10)
  - `마포구 아귀찜 맛집/마포구 아귀찜` (각 10)
  - `공덕 아귀찜` (55), `공덕역 아귀찜` (45), `마포 아귀찜` (45), `도화동 해물찜` (65) 등
  - → **필터 미작동** (store-setup.service 후처리 필터 검증 필요)
- 🚨 **HIDDEN 키워드 오염**: `찜닭 37960`, `조개구이 37820`, `코다리 30410`, `아구찜 60660` — 매장 무관 광범위 키워드 (이전 로직 잔재)

**`/keywords/discover` 엔드포인트 테스트 (AI 재생성)**:
결과가 **완전히 엉터리** — aiRecommended: [] 비어있고 네이버 API 연관검색어만 반환:
- `돈까스 161600`, `횟집 105080`, `영종도맛집 74200`, `송도맛집 70980`, `소갈비찜레시피 48780`, `계란찜 48040`, `찜닭레시피`, `편백찜`, `가오리찜`, `식사동맛집` 등
- **원인**: `keyword-discovery.service.ts`의 AI 프롬프트가 **Phase 8-6에서 교체되지 않았음** — 구버전 "히든 키워드 발굴" 프롬프트 그대로
- **영향**: 매장 등록 시(store-setup)는 공식 프롬프트 사용 OK, 이후 수동 재생성 시 구버전 프롬프트 사용 → 결과 오염

#### 9-1-B. 즉시 수정 완료 (2026-04-15) ✅
- [x] `keyword-discovery.service.ts` AI 프롬프트를 store-setup과 동일한 공식 프롬프트로 교체
- [x] 공통 필터 유틸 `keyword-filter.util.ts` 신설 — `isLowVolumeNonException` + `isNonRegional` + `KEYWORD_KEEP_PATTERN` (회식·상견례·룸·단체·모임·돌잔치·송년·연말)
- [x] `KeywordService.cleanupByRules(storeId)` 추가 + `/stores/:id/keywords/cleanup` 엔드포인트
  - USER_ADDED 제외한 키워드 중 월300미만(예외 제외) 또는 지역성결여 일괄 제거
- [x] 지역 토큰 추출 확장 — 동/구/시 + 매장명 브랜드 힌트(공덕) + 역 조합
- [x] **regex greedy 버그 수정** — `[가-힣]{2,4}` → `[가-힣]{2,4}?` (lazy)
  - 버그: "공덕직영점"에서 "공덕직영"이 추출돼 "공덕 맛집"이 지역성결여로 잘못 삭제됐음
- [x] regionHint 우선순위 전환 — 매장 동주소가 아닌 **매장명 브랜드 힌트 우선** (공덕 vs 도화)
  - 이유: 매장이 도화동에 있어도 고객은 "공덕역 맛집"으로 검색
- [x] 3회 연속 AI 출력 검증 — 공덕역 맛집 / 공덕 아귀찜 / 공덕역 아귀찜 / 공덕 해물찜 / 공덕 점심 / 공덕역 회식 등 의뢰자 기대 패턴 안정 생성
- [x] cleanup 실제 DB 적용 — 25개 오염 키워드 제거 (돈까스/횟집/영종도맛집/마포구도화동혼밥 등)

#### 9-2. 매장명 변형 합산 집계 ✅
- [x] `BrandVolumeService` 신설 — 매장명+지역/역 11종 변형 자동 생성
- [x] 변형: 브랜드(찬란한아구) + 매장명 + 브랜드+공덕 + 브랜드공덕 + 브랜드+공덕역 + 브랜드공덕역 + 브랜드+공덕점 + 브랜드+마포/도화동 조합
- [x] `GET /stores/:id/keywords/brand-volume` 엔드포인트 — variations/totalMonthly/totalDaily 반환
- [x] 네이버 검색광고 API 배치 호출 + 볼륨 0 제외
- (참고: 찬란한아구 같은 소규모 브랜드는 임계 미달로 0 반환 — 정상)

#### 9-3. 키워드 정렬 검증 ✅
- [x] DB 쿼리 확인: `ORDER BY monthlySearchVolume DESC NULLS LAST` 정상
- [x] 실제 출력: 아구찜(60660) → 공덕 맛집(21430) → 도화동 맛집(2650) → 찬란한아구 공덕직영점(430) 순

#### 9-4. 정렬 필터 UI ✅
- [x] `/keywords` 페이지에 정렬 토글 3종 추가 (검색량 순 / 순위 순 / 이름 순)
- [x] 클라이언트 측 `Array.sort` 적용, 서버 왕복 없음

---

### Phase 6: 가맹사업자 전용 기능 (미착수)
- [ ] FranchiseGroup CRUD API
- [ ] 가맹점 일괄 등록
- [ ] 가맹 대시보드 (전체 가맹점 한눈에 + 부족점 하이라이트)
- [ ] 가맹점별 드릴다운

### 향후 (의뢰자 피드백 대기)
- [ ] 회원가입 폼에 개인/가맹 선택
- [ ] 데이터랩 검색량 추이 (1년치 일별)
- [ ] 글로벌 키워드 히스토리 공유 (다른 사용자 데이터 활용)
- [ ] SmartPlace OAuth로 본인 매장 saveCount 가져오기

---

## 진행 로그

| 날짜 | 작업 | 비고 |
|------|------|------|
| 2026-04-14 | 마스터 플랜 + CLAUDE.md + 메모리 셋업 | 준비 |
| 2026-04-14 | Phase 0 (DB 스키마 + 슈퍼관리자 + 룰 관리) | 1차 커밋 e82017c (36파일 +3,703줄) |
| 2026-04-14 | Phase 1 (가입→자동분석 파이프라인) | 1차 커밋 |
| 2026-04-14 | Phase 2 (대시보드 + 분석 + 키워드) | 1차 커밋 |
| 2026-04-14 | Phase 3 (마케팅 엔진 4단계) | 2차 커밋 a063b50 (10파일 +934줄) |
| 2026-04-14 | Phase 4 (블로그 상위노출) | 2차 커밋 |
| 2026-04-14 | Phase 5 (메뉴 + CTA + 외국인 + AI키) | 3차 커밋 2711ab6 (11파일 +453줄) |
| 2026-04-14 | 사용자 시드 스크립트 | 4차 커밋 f597eec |
| 2026-04-14 | GitHub Actions 자동 빌드 + 배포 | API+Web 이미지 빌드 성공, deploy SSH 키 미설정으로 실패 |
| 2026-04-14 | 로컬 테스트 매장 등록 (창심관 → 찬란한아구 공덕직영점) | DB 시드 |
| 2026-04-14 | 네이버 API 응답 구조 변경 대응 | Place summary, 경쟁사 placeId, 주소 파싱 |
| 2026-04-14 | Claude CLI 컨테이너 마운트 | 호스트 nvm + .claude 볼륨 |
| 2026-04-15 | Phase 7 (AI 키워드 + 경쟁 매트릭스 + 키워드 상세) | 신규 |
| 2026-04-15 | 키워드 페이지 전면 재설계 (Top 3 카드) | UX 개선 |
| 2026-04-15 | 경쟁비교 격차 시각화 (막대바 + 진단) | UX 개선 |
| 2026-04-15 | 대시보드 액션 아코디언 + AI 캐싱 | 성능 + UX |
| 2026-04-15 | 저장수 컬럼 모든 곳 제거 | 자동 수집 불가 인정 |
| 2026-04-15 | "내 매장" 메뉴 제거 + StoreSwitcher 통합 | UX |
| 2026-04-15 | 일/주/월 검색량 + 키워드 추가 미리보기 | UX |
| 2026-04-15 | 검색량 자동 채우기 (5개 배치) | 신규 매장도 자동 |
| 2026-04-15 | Top 50 매장 확장 + 병렬 처리 | 5개씩 배치 |
| 2026-04-15 | 분석 페이지 진단 정확화 (저장수 제거 + 추가 진단 3종) | 신뢰성 |
| 2026-04-15 | Phase 8-1 스키마 (StoreDailySnapshot/CompetitorDailySnapshot/KeywordDailyVolume/ExcludedKeyword) + 마이그레이션 | 일별 스냅샷 인프라 |
| 2026-04-15 | Phase 8-6 AI 키워드 프롬프트 의뢰자 공식 버전 교체 + 월300 필터(회식 예외) + 키워드 제외 API/UI | 키워드 정확도 |
| 2026-04-15 | Phase 8-7 외국인 상권 → "구글 광고 유입 상담" 포지셔닝 + 5가지 진단 체크리스트 | 리드젠 전환 |
| 2026-04-15 | Phase 8-2~5 일별 수집 Job(@Cron 01:00) + DailySnapshotService(getStoreFlow/CompetitorDailyAverages) + /flow + /competitors/daily API + 매장분석 페이지 3카드 추가(발행속도/상위10vs내/키워드별순위) | 속도 기반 비교 |
| 2026-04-15 | Phase 8-4 경쟁 비교 페이지 일평균 기반 재설계 + 누적 요약 상단 이동 + 발행속도 정렬/delta/진단 | 동적 전환 |
| 2026-04-15 | Phase 8-5 대시보드 리뷰 delta(+N 오늘) + 10일 스파크라인 2종 + 키워드 검색량 어제→오늘 + /keywords/flow API | 동적 대시보드 |
| 2026-04-15 | 상담 관리자 화면 추가 (/admin/consultations) — 상태탭/연락완료/완료/취소 + 24시간+ 대기 하이라이트 | 관리자 누락 보완 |
| 2026-04-15 | ConsultationCTA 배치 확장 — 경쟁비교(GENERAL) + 키워드(KEYWORD) 페이지 하단 | 리드젠 강화 |
| 2026-04-15 | **대시보드 AI 블로킹 제거** — marketingEngine.diagnose 캐시 미스 시 룰 기반 즉시 응답 + 백그라운드 AI 보강 + lock 가드, 프론트 aiPending 감지 시 8초 폴링 + "AI 보강 중" 배지 | UX 체감속도 대폭 개선 |
| 2026-04-15 | 대시보드 store 쿼리 중복 제거 — findUnique 2회 → 1회(preloadedStore 주입), DB 라운드트립 절감 | 첫 로드 응답 시간 단축 |
| 2026-04-15 | 일별 스냅샷 Job 실제 수집 검증 (매장 2/경쟁사 6/키워드 31건 적재 성공, 9.7s) | Phase 8 데이터 파이프라인 가동 확인 |
| 2026-04-15 | /content·/reviews·/events API 엔드포인트 검증 (200 OK, 15~20ms) | 런타임 연동 확인 |
| 2026-04-15 | 회원가입 폼 개인/가맹 분기 + 실제 API 연동(RegisterDto 확장: role·phone·companyName·businessNumber) — 기존 submit 없던 껍데기 → 정상 가입 플로우 | 가맹 준비 + 기본 기능 누락 해결 |
| 2026-04-15 | **Phase 9 실증 테스트** — discover API 오염(돈까스/영종도맛집), 공식 프롬프트 미적용, 월300필터 누락, 지역+역 쌍/상황 키워드 누락 다수 발견 → Phase 9-1-B 수정 목록 확정 | 숨은 버그 드러냄 |
| 2026-04-15 | **Phase 9-1-B 수정 완료** — 공식 프롬프트 통일, cleanup 엔드포인트, regex greedy 버그 수정(공덕직영 → 공덕), regionHint 브랜드힌트 우선화, 지역 토큰 확장, 3회 실증 검증 통과 | 키워드 품질 핵심 수정 |
| 2026-04-15 | **Phase 9 완료** (9-2 BrandVolumeService + 11종 변형 합산 API, 9-3 정렬 DB 검증, 9-4 /keywords 정렬 토글 3종) | Phase 9 100% |
| 2026-04-15 | **의뢰자 피드백 반영** — /analysis CompareBar 화살표+±숫자(+99/-88), CompetitorDailyCard 데이터 부족 명시 메시지, /competitors 일/주/week/month 기간 토글 + 기간별 변동량 비교 + DeltaBadge 통일(TrendingUp/Down/Minus), daily-snapshot.service에 deltaDay/Week/Month 합산 추가, /keywords Top 3 카드+상세 Top 10 확인 | UX 구체성 + 통일성 |
| 2026-04-15 | **의뢰자 재피드백 2차 반영** — /analysis 매장 비교 테이블 "앞서고 있음"/"N배 뒤처짐" → `+1200개/-330개 (3.2배)` 화살표 수치, MetricBox도 동일, /competitors [날짜] 기간 토글 추가 + 날짜 드롭다운 + `/stores/:id/competitors/timeline` 30일 API + 선택 날짜 당일 delta 표시 | 구체 수치화 + 날짜별 조회 |
| 2026-04-15 | **주/월 변동량 계산 로직 리팩터** — delta 합산에서 절대값 차이(today vs N일 전)로 전환 → 부분 데이터로도 값 노출. `diffCount()` 헬퍼 추가, 정확히 N일 전 없으면 가장 오래된 baseline 사용(partial 집계). 실제 API 응답 일/주/월 모두 채워짐 확인 | 부분 데이터에서도 변동량 표시 |

---

## 2026-04-15 세션 요약

### 완료한 것
1. **Phase 8 전체 (일별 스냅샷 아키텍처)**
   - 4개 테이블 신설 (StoreDailySnapshot / CompetitorDailySnapshot / KeywordDailyVolume / ExcludedKeyword)
   - 01:00 Cron `DailySnapshotJob` + 수동 트리거 엔드포인트
   - 대시보드: delta 표시 + 10일 스파크라인 + 키워드 어제→오늘 검색량
   - 매장분석: 3카드(발행속도/상위10 vs 내/키워드별 순위)
   - 경쟁비교: 누적 → 일평균 발행량 기준 전환
   - 날짜별/일/주/월 기간 토글 + 날짜 드롭다운 (30일)
   - 주/월 변동량 절대값 차이 계산(delta 합이 아닌 today vs N일 전)

2. **Phase 9 키워드 품질 개선 (100%)**
   - keyword-discovery.service 공식 프롬프트 교체
   - keyword-filter.util.ts (isLowVolumeNonException / isNonRegional / KEYWORD_KEEP_PATTERN)
   - `/stores/:id/keywords/cleanup` — 월300미만·지역성결여 일괄 제거
   - regex greedy 버그 수정 (공덕직영 → 공덕)
   - regionHint 우선순위 전환(매장명 브랜드 힌트 우선)
   - BrandVolumeService — 매장명+지역/역 11종 변형 합산 검색량
   - /keywords 정렬 토글 3종(검색량/순위/이름)

3. **대시보드 성능 개선**
   - AI 블로킹 제거 — 룰 기반 즉시 응답 + 백그라운드 AI + 8초 폴링
   - store 쿼리 중복 제거 (preloadedStore 주입)
   - aiPending 플래그 + UI 배지("AI 보강 중")

4. **수치화·통일성**
   - "앞서고 있음"/"N배 뒤처짐" → `↑ +1200개 / ↓ -330개 (3.2배)` 화살표 + ±숫자
   - DeltaBadge 통일 (TrendingUp/TrendingDown/Minus)
   - 매장분석 CompareBar, MetricBox 모두 통일

5. **리드젠/관리**
   - 상담 관리자 화면 `/admin/consultations` (상태탭·연락완료·24h+ 대기 하이라이트)
   - ConsultationCTA 경쟁비교·키워드 추가 배치
   - 회원가입 개인/가맹 분기 + 실 API 연동(이전엔 submit조차 없던 껍데기)

6. **검증**
   - 일별 스냅샷 수집 실동작 확인(매장 2/경쟁사 6/키워드 31)
   - /content /reviews /events API 엔드포인트 200 OK
   - AI 키워드 3회 연속 샘플 의뢰자 기대 패턴 생성 확인

### 미결 / 다음 세션
- **UI 런타임 검증** — 의뢰자가 "경쟁사 수집중으로 나온다"고 피드백. 백엔드 API에는 값 채워짐 확인했으나 프런트 렌더링 확인 필요
- 2일치 스냅샷 확보 후 실제 delta 표시 최종 확인 (내일 01:00 Cron 자동 실행)
- SmartPlace OAuth saveCount
- 데이터랩 1년 일별 추이
- GitHub Actions SSH 자동 배포

---

## 미완료 / 다음 세션 우선순위

1. **Phase 8: 일별 스냅샷 + 속도 기반 재설계** — 의뢰자 최신 피드백 최우선
2. **Phase 6: 가맹사업자 전용 기능** — 의뢰자 직접 요구사항
3. **회원가입 폼 개인/가맹 선택** — 회원 유형별 분기
4. **SmartPlace OAuth 강화** — 본인 매장 saveCount 가져오기
5. **GitHub Actions SSH 키 설정** — 자동 배포 정상화

---

## 제품 포지셔닝 (의뢰자 언급)

- 레퍼런스: **애드로그**(데이터/순위) + **장사닥터**(사장님 친화 솔루션)
- 목표: **"애드로그 + 장사닥터 = 한눈에 솔루션"** 업그레이드 버전
- 핵심 메시지: "지금 이 속도로 상위권 유지/진입 가능한가"

---

## 2026-04-22 대규모 디자인/UX 재편 세션

### 확정 전략 (의뢰자 결정)
- **포지션**: 장사탁터 종합 플랫폼과 **정면 대결 금지**. **"네이버 플레이스 마케팅 전문"** 단일 영역 독보적 깊이 — "마케팅은 우리, 매출은 장사탁터" 구도.
- **디자인 시스템**: Apple 가이드 **70% 채택** + 한글/B2B SaaS 특성 **30% 현지화**. 상세는 `DESIGN-apple.md §10 Adaptation`.
- **폰트**: Paperlogy(한글 geometric sans). weight 4종(400/500/600/700). 자간 `-0.018em`(본문) / `-0.022em`(헤드), line-height `1.55`/`1.25`, `word-break: keep-all`.
- **모바일 퍼스트**: 390px(iPhone 13 mini) 기준. 가로 스크롤 0 강제.
- **앱 전략**: 웹 완성 후 React Native + Expo (API/타입 공유). 현재는 웹만.

### 오늘 완료 작업 (13개 커밋)
1. ✅ `01b9ec6` 키워드 상세 Top N — 모바일 카드 레이아웃 (가로 스크롤 제거)
2. ✅ `e7cb340` 홈 대시보드 전면 재설계 — C+A 하이브리드
   - 🌅 내 매장 지표 / ⚡ 지금 경쟁 구도(격차) / 🎯 AI 1순위 히어로 / 🔑 키워드 TOP3 / 더 둘러보기
3. ✅ `3cdca8c` + `b2823b0` 초대하기 시스템
   - `User.referralCode/referredByUserId/points` 필드 추가 + 마이그레이션
   - `/invite` 페이지, 홈 배너, `/register?ref=CODE` 자동 수용
4. ✅ `a31c358` 문구 교체 (경쟁 비교 → 경쟁매장/경쟁 한눈에)
5. ✅ `b38dec6` + `11c38ac` /competitors 재설계
   - 기준(방문자/블로그) × 정렬(누적/증감/증감률) **콤보 2개 분리**
   - 카드 아이콘 + 한 줄 압축 (💬/📝 + 숫자 + 증감 + 증감률)
6. ✅ `19bf593` /ingredients 모바일 카드 뷰 (현재가 + 전주/전월 한 줄)
7. ✅ `3a7a350` + `ba53663` 홈 액션 href 에러 수정
   - AI 가 `/dashboard/xxx` 같이 존재 안 하는 경로 뱉던 문제
   - dashboard.service 에 화이트리스트 sanitize (이중 안전망)
8. ✅ `ba53663` KAMIS 시계열 실가격 그대로 사용
   - `today=0` 이어도 `week/month` 유지 (filter 완화)
   - 카테고리 빈 응답이면 **어제로 재시도**
   - `IngredientPrice.priceWeekAgo/priceMonthAgo` 필드 (수집 시 함께 저장)
9. ✅ `721349d` / `23a00f7` / `cc8fd82` 모바일 터치 타겟 44/36 + Button 밀도 복원
10. ✅ `89ed3d4` Paperlogy 로컬 폰트 적용
11. ✅ `959fa72` / `2a7d561` / `9976494` / `6700168` 경쟁사 선별 고도화
    - narrow(공덕 아구찜) + medium(마포 아구찜) 혼합 5~6개 쿼리
    - 메뉴 토큰 매칭 필수 (한식/곱창/냉면 같은 다른 업종 금지)
    - `POST /stores/:id/competitors/rediscover` 수동 재탐색 endpoint
12. ✅ `54c2f80` 신규 가입자 Top N 증감 3단 폴백 (real → backfill → estimate, `~` 접두사)
13. ✅ 키워드 상세 N일전 선형 외삽 — 2일치 데이터로 7/30일 탭 값 `~+N` 추정 표시

### 운영 환경 (이 머신 자체가 서버)
- **서버 = 개발자 머신** (Linux, Docker). `1.221.158.115:3200` 접속.
- **컨테이너**: mk_api(4000), mk_web(3200→내부3000), mk_postgres(5433→내부5432), mk_redis, mk_mongodb, watchtower
- **Watchtower**: GHCR `:latest` 자동 pull 후 재시작 (업타임 4+일, 건강)
- **GHA `Build & Deploy`**: `build-api`/`build-web` 는 항상 ✓ (GHCR 푸시 성공). `deploy` 단계는 SSH secret 미설정으로 항상 ✗ (무관 — Watchtower 대체).
- **Next.js 캐시**: Turbopack 청크 파일명 안정 재사용 문제로 `Cache-Control: must-revalidate` 적용(`next.config.js`). 기존 `immutable` 캐시 있던 사용자는 한 번은 하드 리로드 필요.
- **배포 검증 3단** (롤백 확인):
  ```
  git log --oneline -3
  docker inspect mk_api --format='{{.Image}}'
  docker manifest inspect ghcr.io/cho-y-j/marketing-api:latest | grep digest | head -1
  ```
  세 digest/커밋이 같은 흐름이면 정상. 방금 푸시 후 Watchtower 즉시 실행 원하면:
  ```
  docker exec watchtower /watchtower --run-once --cleanup mk_api mk_web
  ```

### 알려진 제약 (오늘까지 해결 못 한 것)
- **키워드 순위 자동 cron 불안정**: `batch-analysis.job.ts` 에 `@Cron("0 5 * * *")` 있으나 4-16~19 기간 안 돔(FREE 필터 버그 주석 있음). 현재 복구됨이나 수동 트리거 필요할 수 있음.
- **KAMIS 수산물 카테고리(600) 간헐적 빈 응답**: 어제 재시도 로직으로 회피.
- **매출 데이터 없음**: 플랫폼 연동(배민/요기요/홈택스) 미구현 — 경쟁사 장사탁터와의 결정적 차이. 현재 전략은 이 영역 회피하고 마케팅 전문으로 포지션.

### 내일 이후 (우선순위)
1. **admin 계정 (슈퍼관리자)** 로그인 시 `/admin/users` 자동 리다이렉트 — 매장 없는 관리자에게 "매장 등록" 화면 뜨는 UX 교정
2. **상품화 전 최종 점검** — 의뢰자 7만원/월 받으려면 다음 필요 (2026-04-22 피드백):
   - 홈 히어로 인사이트 ("대왕아구찜 +58 vs 우리 +2" 같은 감정적 신호)
   - 액션 퍼스트 UI (데이터 → 해석 → 처방 의료 비유)
   - 주간 AI 브리핑 푸시/메일 발송 (백엔드 `briefing` 이미 있음)
   - 차트/스파크라인 (숫자 나열 → 시각화)
   - 카피 톤: "기록없음" → "내일부터 쌓여요", "100위 밖" → "가능성 키워드" 등
3. **초대하기 포인트 지급 로직** — 규칙(초대 1명당 2,000P?) + 전환 조건(매장 등록 완료 시 지급?) 확정
4. **모바일 앱** — 웹 안정화 후 React Native + Expo

---

## 2026-04-27 세션 — 순위 수집 근본 재설계 + 변동율 표시 정석화

### 배경
1주일 동안 모든 currentRank 가 NULL/오염되어 사장님 매장 진짜 순위 (가경동 맛집 = 15위 등) 가 한 번도 안 보임. 실측으로 m.search.naver.com 경로의 3중 결함 발견.

### 발견된 결함
1. **m.search.naver.com SSR display=5 하드코딩** — 우리 스크래퍼는 page step 10 가정. 6~10등은 영영 못 가져옴
2. **start 파라미터 SSR 무효** — start=1, 11, 21, ... 모두 동일한 1~5위만 반복 수집
3. **좌표 누락 시 서울 default** — 청주 매장이 서울 기준으로 검색되어 결과 오염

### 수정 (모두 머지됨)
- **fetcher 교체**: `m.search.naver.com` → `pcmap.place.naver.com/restaurant/list?display=70` + 좌표(`Store.mapx/mapy`)
  - 한 번 호출에 70개 + visitor/blog/save/category 풍부 (Place API 추가 호출 0회)
  - `naver-rank-checker.provider.ts` 전면 재작성
- **30일 백필 + 매일 cron 마이그레이션**:
  - `competitor-backfill.service.ts` 에 `backfillKeywordRanks` 추가
  - `DailySnapshotJob` upsert 의 `update` 절에 `isEstimated: false` 명시 → 추정 → 실측 자연 전환
  - 매장 등록 순서 변경: 백필 먼저 → 첫 스냅샷 (어제 row 와 비교해 오늘 delta 정상 계산)
- **변동량 데이터 소스 교체**: keyword.service `findAllWithCompetition` + rank-check.service `getKeywordCompetition` 의 1d/7d/30d delta 계산을 `KeywordRankHistory.topPlaces` (백필 같은 값 복제) → `StoreDailySnapshot/CompetitorDailySnapshot` 직접 비교로 변경
- **UI 통일**:
  - `~` 추정 마크 완전 제거
  - 색: 양수=빨강, 음수=파랑, ±0=회색 (visitor/blog). 순위 변동만 별개 (좋아짐=파랑)
  - 기간 토글 통일: `/keywords` 1일/7일/30일, `/keywords/[keyword]` 1/7/30일 + 달력
  - "300위 밖" → "70위 밖" 정직 표기
- **변동율 가중치 (정석)** — `/competitors` `getStatus`:
  - 급증: rate ≥ 경쟁사 평균 × 1.5 AND delta ≥ 5
  - 활발: rate ≥ 경쟁사 평균 AND delta ≥ 3
  - 평온: rate ≥ 0 / 감소: rate < 0
  - 작은 매장 부풀림 방지 (외식업 SaaS 표준)

### 라이브 검증
| 매장 | 결과 |
|---|---|
| 남다른대구막창 서현점 | 가경동 맛집 = **15위**, 가경동 막창 = **9위** |
| 남해막창꼼장어 | **청주 꼼장어 = 1위**, 가경동 막창 = 12위, 가경동 회식 = 50위 |

신규 등록 풀 스텝 (키워드 8 + 경쟁사 6 + 백필 30일 × 매장+경쟁사+키워드 + 첫 분석/스냅샷/브리핑) 에러 0건 통과.

### 한계 (다음 세션)
- **Top 70 너머**: pcmap 도 SSR 70개 한계, 페이지네이션 클릭은 service worker 우회 GraphQL 로 캡쳐 불가. 현재 Top 70 가 단발 한계. adlog 가 어떻게 Top 300 까지 가는지는 reverse engineering 추가 필요
- **순위(rank) 자체 백필 불가**: KeywordRankHistory 는 오늘 측정값 복제만. 진짜 순위 변동은 매일 cron 누적 7일 후부터
