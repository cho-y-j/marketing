# Marketing Intelligence Platform

## 프로젝트 개요
자영업자(개인사업자 + 가맹사업자) 대상 네이버 플레이스 마케팅 분석 플랫폼.
가입 즉시 매장 현위치 파악 → 부족점 인식 → 전문 상담(광고 유치) 연결하는 리드젠 퍼널.

## 아키텍처 (중요)
```
[웹 프론트엔드] ← 결과 표시만 (뷰어)
       │
[NestJS API] ← 인증/라우팅
       │
[CLI 엔진 (Bull Queue)] ← 모든 실제 작업 수행
  ├─ 자동 작업: 순위 체크, 경쟁사 분석, 키워드 생성, 블로그 노출 체크
  ├─ 고객 요청 처리: 웹에서 요청 → CLI가 신규 발동하여 작업
  └─ 생성형 AI: 고객 API Key 우선 사용 / 없으면 서비스 키 사용
       │
[PostgreSQL + Redis] → 결과 저장 → 웹에서 조회
```
- 웹은 단순 뷰어. 분석/수집/처리는 전부 CLI(백엔드)가 담당
- 고객이 API Key를 넣으면 블로그 글 생성, 댓글 생성 등 생성형 작업은 고객 키로 작동 (구조 미리 마련)

## 회원 유형
- **개인사업자**: 단일 매장 관리
- **가맹사업자**: 전체 가맹점 한눈에 파악 + 개별 매장은 개인사업자와 동일
- **슈퍼관리자**: 회원 관리(상세/수정/삭제/정지) + 룰 관리(업종별 키워드 룰 등)

## 기술 스택
- **Monorepo**: pnpm workspace + Turborepo
- **Frontend**: Next.js 16 (React 19, App Router), shadcn/ui, Tailwind CSS, Zustand, React Query, Recharts
- **Backend**: NestJS 10, Prisma ORM, PostgreSQL, Redis (IORedis), Bull Queue
- **AI**: Claude API (@anthropic-ai/sdk), OpenAI (fallback)
- **External APIs**: Naver SearchAD, Naver Place, Naver SmartPlace
- **Auth**: JWT + Passport.js + NextAuth.js + Naver OAuth
- **Scraping**: Playwright (블로그/플레이스 데이터 수집)

## 프로젝트 구조
```
apps/web/                   # Next.js 프론트엔드 (뷰어)
packages/api/               # NestJS 백엔드 + CLI 엔진
packages/shared/            # 공유 타입/유틸
packages/eslint-config/
packages/typescript-config/
adlog/                      # 레퍼런스 HTML (애드로그 화면 참고용)
```

## 핵심 플로우
```
1. 가입 → 플레이스 URL 입력 or 네이버 로그인 → 매장 정보 자동 수집
2. 업종+지역 → 키워드 룰 테이블 → 검색 키워드 자동 생성
3. 키워드로 네이버 검색 → 경쟁 업체 자동 탐지 + 사용자 직접 추가(존재여부 검증)
4. CLI가 자동 분석: 순위, 리뷰, 블로그, 저장수, 블로그 상위노출
5. 로그인 시 대시보드에서 한눈에 비교분석 파악
6. 상세 → 키워드 순위, 경쟁업체 상세 분석
7. 부족점 인식 → 전문 상담 CTA → 광고 계약
```

## 주요 기능
### 슈퍼관리자
- 회원 관리: 목록/상세/수정/삭제/정지
- 룰 관리: 업종별 키워드 룰 테이블 CRUD

### 고객 화면
- 대시보드: "오늘 해야 할 것" 중심, 현재 상태 요약, 액션 3가지
- 매장 분석: 문제 → 원인 → 해결 구조
- 키워드 순위: 일별 추이 (애드로그 스타일), 경쟁사 비교
- 블로그 상위노출: 키워드별 블로그 영역 노출, 경쟁 강도
- 경쟁 비교: 리뷰/블로그/저장수/순위 대비
- 마케팅 실행: 키워드 관리, 콘텐츠 생성, 리뷰 관리
- 외국인 상권 진단

### CLI 엔진 (백엔드 자동 작업)
- 네이버 플레이스 순위 체크 (정기)
- 경쟁사 데이터 수집 (정기)
- 키워드 검색량/트렌드 수집
- 블로그 상위노출 체크
- 고객 요청 시 신규 분석 발동
- 생성형 AI 작업 (고객 API Key 우선)

## 개발 규칙
- 한국어 UI, 코드는 영어
- N1/N2/N3 같은 전문 용어 → 직관적 한국어 표현 사용
- DB 마이그레이션: `npx prisma migrate dev`
- 컴포넌트: shadcn/ui 기반
- API: NestJS 컨벤션 (Controller → Service)
- 새 기능 추가 시 "CLI가 어떻게 실행하는가" 부터 설계, 프론트는 결과 조회/표시만

## 작업 관리
- **마스터 플랜**: `plan.md` — 전면 리뉴얼 체크리스트. 새 세션 시작 시 반드시 이 파일을 먼저 읽고 현재 진행 상태 확인 후 이어서 작업
- **메모리**: `.claude/projects/-home-cho-pro-marketing/memory/` — 의뢰자 피드백, 비즈니스 모델, 아키텍처 결정 등 기록

## 세션 시작 시 필수 확인
1. `plan.md` 읽기 → 체크리스트에서 현재 진행 위치 파악
2. 미완료 항목부터 이어서 작업
3. 작업 완료 시 즉시 plan.md 체크 표시 ([ ] → [x])
4. 진행 로그 테이블에 날짜별 작업 내용 기록

## 레퍼런스
- `adlog/` 디렉토리: 애드로그(adlog.kr) 화면 HTML 21개 파일
- 핵심 참고: 순위비교분석, 키워드분석, 블로그순위체크, 히든키워드, 유입통계
