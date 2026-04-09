/**
 * Bull 큐 이름 상수.
 * 큐 추가 시 여기에서 관리.
 */
export const QUEUES = {
  ANALYSIS: "analysis",
  RANK_CHECK: "rank-check",
  BRIEFING: "briefing",
  REVIEW: "review",
  EXTERNAL_DATA: "external-data",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
