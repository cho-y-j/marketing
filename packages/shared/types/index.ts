// 구독 플랜
export type SubscriptionPlan = "FREE" | "BASIC" | "PREMIUM";

// 경쟁 매장 유형
export type CompetitorType = "AUTO" | "USER_SET" | "CROSS_INDUSTRY";

// 키워드 유형
export type KeywordType =
  | "MAIN"
  | "AI_RECOMMENDED"
  | "HIDDEN"
  | "SEASONAL"
  | "USER_ADDED";

// 트렌드 방향
export type TrendDirection = "UP" | "DOWN" | "STABLE";

// 콘텐츠 유형
export type ContentType =
  | "PLACE_POST"
  | "REVIEW_REPLY"
  | "SNS_POST"
  | "BLOG_POST";

// 콘텐츠 상태
export type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

// API 응답 표준 포맷
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// 매장 기본 정보
export interface StoreInfo {
  id: string;
  name: string;
  naverPlaceId?: string;
  naverPlaceUrl?: string;
  category?: string;
  subCategory?: string;
  address?: string;
  phone?: string;
  district?: string;
  competitiveScore?: number;
}

// 오늘 할 일 액션
export interface TodayAction {
  order: number;
  action: string;
  reason: string;
  howTo: string;
}

// 오늘 장사 브리핑
export interface DailyBriefingData {
  greeting: string;
  trends: Array<{
    keyword: string;
    change: string;
    insight: string;
  }>;
  competitorAlert: string | null;
  todayActions: TodayAction[];
  motivation: string;
}

// AI 분석 결과
export interface AnalysisResult {
  competitiveScore: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  competitorComparison: {
    avgReceiptReviews: number;
    myReceiptReviews: number;
    gap: string;
  };
  recommendations: Array<{
    priority: "HIGH" | "MEDIUM" | "LOW";
    action: string;
    reason: string;
    expectedEffect: string;
  }>;
}
