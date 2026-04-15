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
- **Scraping**: Playwright (선택적, 없으면 검색 API 폴백)

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
