/**
 * 디자인 시스템 상수 & 유틸리티
 * 모든 컴포넌트에서 이 파일의 상수만 사용할 것
 *
 * 규칙:
 * - 카드: rounded-2xl border border-border-primary bg-surface shadow-sm
 * - 간격: p-4, p-6 (p-5 금지)
 * - 아이콘: size-4 (16px) 통일, 배경 원은 size-8 rounded-xl
 * - 폰트: text-xs(보조), text-sm(본문), text-base(소제목), text-lg+(제목)
 */

// 경쟁력 점수 색상 매핑
export const SCORE_COLORS = {
  good: {
    text: "text-score-good",
    bg: "bg-score-good-bg",
    fill: "text-score-good",
    label: "양호",
    min: 71,
  },
  mid: {
    text: "text-score-mid",
    bg: "bg-score-mid-bg",
    fill: "text-score-mid",
    label: "보통",
    min: 41,
  },
  bad: {
    text: "text-score-bad",
    bg: "bg-score-bad-bg",
    fill: "text-score-bad",
    label: "개선 필요",
    min: 0,
  },
} as const;

export function getScoreLevel(score: number) {
  if (score >= 71) return SCORE_COLORS.good;
  if (score >= 41) return SCORE_COLORS.mid;
  return SCORE_COLORS.bad;
}

// 등급 설정
export const GRADE_CONFIG = {
  DIAMOND: {
    label: "다이아몬드",
    icon: "💎",
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  GOLD: {
    label: "골드",
    icon: "🥇",
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  SILVER: {
    label: "실버",
    icon: "🥈",
    color: "text-gray-600",
    bg: "bg-gray-50",
    border: "border-gray-200",
  },
  BRONZE: {
    label: "브론즈",
    icon: "🥉",
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
  },
} as const;

export type GradeKey = keyof typeof GRADE_CONFIG;

export function getGradeConfig(grade: string) {
  return GRADE_CONFIG[grade as GradeKey] ?? GRADE_CONFIG.BRONZE;
}

// 키워드 타입 뱃지
export const KEYWORD_TYPE_CONFIG = {
  MAIN: { label: "메인", color: "bg-brand text-white" },
  AI_RECOMMENDED: { label: "AI추천", color: "bg-violet-100 text-violet-700" },
  HIDDEN: { label: "히든", color: "bg-amber-100 text-amber-700" },
  SEASONAL: { label: "시즌", color: "bg-emerald-100 text-emerald-700" },
  USER_ADDED: { label: "직접추가", color: "bg-gray-100 text-gray-700" },
} as const;

export function getKeywordTypeConfig(type: string) {
  return KEYWORD_TYPE_CONFIG[type as keyof typeof KEYWORD_TYPE_CONFIG] ?? KEYWORD_TYPE_CONFIG.USER_ADDED;
}

// 리뷰 상태 뱃지
export const REVIEW_STATUS_CONFIG = {
  PENDING: { label: "수집됨", color: "bg-gray-100 text-gray-600" },
  DRAFTED: { label: "AI 초안", color: "bg-brand-subtle text-brand" },
  APPROVED: { label: "승인됨", color: "bg-success-light text-success" },
  REJECTED: { label: "거절됨", color: "bg-danger-light text-danger" },
  PUBLISHED: { label: "게시됨", color: "bg-emerald-100 text-emerald-700" },
} as const;

export function getReviewStatusConfig(status: string) {
  return REVIEW_STATUS_CONFIG[status as keyof typeof REVIEW_STATUS_CONFIG] ?? REVIEW_STATUS_CONFIG.PENDING;
}

// 액션 타입 설정
export const ACTION_TYPE_CONFIG = {
  CONTENT_PUBLISH: { label: "콘텐츠 발행", icon: "FileText", color: "text-brand", bg: "bg-brand-subtle" },
  REVIEW_REPLY: { label: "리뷰 답변", icon: "MessageSquare", color: "text-info", bg: "bg-info-light" },
  KEYWORD_ADD: { label: "키워드 추가", icon: "Search", color: "text-success", bg: "bg-success-light" },
  SEASONAL_KEYWORD: { label: "시즌 키워드", icon: "TrendingUp", color: "text-warning", bg: "bg-warning-light" },
} as const;

// 차트 색상 배열 (Recharts용)
export const CHART_COLORS = [
  "var(--color-chart-blue)",
  "var(--color-chart-emerald)",
  "var(--color-chart-amber)",
  "var(--color-chart-rose)",
  "var(--color-chart-violet)",
];

// 숫자 포맷 유틸
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toLocaleString("ko-KR");
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

export function formatRank(rank: number | null | undefined): string {
  if (rank == null) return "-위";
  return `${rank}위`;
}

// 트렌드 방향
export function getTrendStyle(direction: string | null) {
  switch (direction) {
    case "UP":
      return { color: "text-success", arrow: "↑", label: "상승" };
    case "DOWN":
      return { color: "text-danger", arrow: "↓", label: "하락" };
    default:
      return { color: "text-text-tertiary", arrow: "-", label: "유지" };
  }
}

// 카드 기본 클래스
export const CARD_BASE = "rounded-2xl border border-border-primary bg-surface shadow-sm";

// 아이콘 래퍼 기본 클래스
export const ICON_WRAPPER = "flex items-center justify-center size-8 rounded-xl";
