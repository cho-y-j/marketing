"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useStore } from "@/hooks/useStore";
import {
  useReviews,
  useFetchReviews,
  useDraftReplies,
  useApproveReply,
  useRejectReply,
  StoreReview,
} from "@/hooks/useReviews";
import { formatNumber, getReviewStatusConfig, CARD_BASE } from "@/lib/design-system";
import { toast } from "sonner";
import {
  MessageSquare,
  Sparkles,
  RefreshCw,
  Loader2,
  Check,
  X,
  Edit2,
  Star,
  Clock,
  Copy,
  ExternalLink,
} from "lucide-react";

export default function ReviewsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: store } = useStore(storeId);
  const naverPlaceId = store?.naverPlaceId;
  const smartPlaceBizId = store?.smartPlaceBizId;
  const smartPlaceReviewUrl = smartPlaceBizId
    ? `https://new-smartplace.naver.com/bizes/${smartPlaceBizId}/reviews/list`
    : "https://new-smartplace.naver.com/bizes/my-bizes";
  const { data: reviews, isLoading } = useReviews(storeId);
  const fetchMutation = useFetchReviews(storeId);
  const draftMutation = useDraftReplies(storeId);
  const approveMutation = useApproveReply(storeId);
  const rejectMutation = useRejectReply(storeId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const handleFetch = () => {
    fetchMutation.mutate(undefined, {
      onSuccess: (added) => toast.success(`리뷰 ${added}건 새로 수집됨`),
      onError: (e: any) =>
        toast.error("수집 실패: " + (e.response?.data?.message || e.message)),
    });
  };

  const handleDraft = () => {
    draftMutation.mutate(undefined, {
      onSuccess: (drafted) =>
        toast.success(`AI 답글 초안 ${drafted}건 작성 완료`),
      onError: (e: any) =>
        toast.error("초안 생성 실패: " + (e.response?.data?.message || e.message)),
    });
  };

  const startEdit = (review: StoreReview) => {
    setEditingId(review.id);
    setEditText(review.draftReply || "");
  };

  const handleApprove = (review: StoreReview, finalReply?: string) => {
    approveMutation.mutate(
      { reviewId: review.id, finalReply },
      {
        onSuccess: () => {
          toast.success("답글이 승인되었습니다");
          setEditingId(null);
        },
        onError: (e: any) =>
          toast.error("승인 실패: " + (e.response?.data?.message || e.message)),
      },
    );
  };

  const handleReject = (review: StoreReview) => {
    rejectMutation.mutate(
      { reviewId: review.id },
      {
        onSuccess: () => toast.success("답글을 거절했습니다"),
        onError: (e: any) =>
          toast.error("거절 실패: " + (e.response?.data?.message || e.message)),
      },
    );
  };

  const list = reviews ?? [];
  const drafted = list.filter((r) => r.replyStatus === "DRAFTED");
  const approved = list.filter((r) => r.replyStatus === "APPROVED");
  const pending = list.filter((r) => r.replyStatus === "PENDING");

  const summaryItems = [
    { label: "전체 리뷰", value: list.length, iconBg: "bg-info-light", iconColor: "text-info", valueColor: "text-info" },
    { label: "수집 대기", value: pending.length, iconBg: "bg-surface-tertiary", iconColor: "text-text-tertiary", valueColor: "text-text-secondary" },
    { label: "검수 대기", value: drafted.length, iconBg: "bg-brand-subtle", iconColor: "text-brand", valueColor: "text-brand" },
    { label: "승인 완료", value: approved.length, iconBg: "bg-success-light", iconColor: "text-success", valueColor: "text-success" },
  ];

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary">
            리뷰 답글 관리
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            네이버 리뷰 수집 + AI 답글 검수 워크플로우
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetch}
            disabled={fetchMutation.isPending}
            className="rounded-xl border-border-primary"
          >
            {fetchMutation.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <RefreshCw size={14} className="mr-1.5" />
            )}
            네이버 리뷰 수집
          </Button>
          <Button
            size="sm"
            onClick={handleDraft}
            disabled={draftMutation.isPending || pending.length === 0}
            className="rounded-xl bg-brand hover:bg-brand-dark text-white shadow-sm"
          >
            {draftMutation.isPending ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <Sparkles size={14} className="mr-1.5" />
            )}
            AI 답글 초안 생성
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryItems.map((m) => (
          <div key={m.label} className={CARD_BASE}>
            <div className="p-4">
              <p className={`text-2xl font-extrabold ${m.valueColor}`}>
                {formatNumber(m.value)}
              </p>
              <p className="text-[11px] text-text-tertiary">{m.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 검수 대기 (DRAFTED) */}
      {drafted.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
            <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center">
              <Edit2 size={12} className="text-brand" />
            </div>
            검수 대기 ({drafted.length})
          </h3>
          <div className="space-y-3">
            {drafted.map((r) => (
              <ReviewCard
                key={r.id}
                review={r}
                editing={editingId === r.id}
                editText={editText}
                onEditTextChange={setEditText}
                onStartEdit={() => startEdit(r)}
                onCancelEdit={() => setEditingId(null)}
                onApprove={(finalReply) => handleApprove(r, finalReply)}
                onReject={() => handleReject(r)}
                actionLoading={approveMutation.isPending || rejectMutation.isPending}
                naverPlaceId={naverPlaceId}
                smartPlaceReviewUrl={smartPlaceReviewUrl}
              />
            ))}
          </div>
        </div>
      )}

      {/* 전체 리뷰 */}
      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : list.length === 0 ? (
        <div className={CARD_BASE}>
          <div className="py-16 text-center">
            <div className="size-16 rounded-2xl bg-brand-subtle flex items-center justify-center mx-auto mb-4">
              <MessageSquare size={24} className="text-brand" />
            </div>
            <p className="text-text-secondary font-medium">
              아직 수집된 리뷰가 없습니다
            </p>
            <p className="text-sm text-text-tertiary mt-1">
              위 "네이버 리뷰 수집" 버튼을 눌러 시작하세요
            </p>
          </div>
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-text-secondary">
            전체 리뷰 ({list.length})
          </h3>
          <div className="space-y-2">
            {list
              .filter((r) => r.replyStatus !== "DRAFTED")
              .map((r) => {
                const statusConfig = getReviewStatusConfig(r.replyStatus);
                return (
                  <div key={r.id} className={`${CARD_BASE} overflow-hidden`}>
                    <div className="py-3 px-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-semibold text-text-primary">
                              {r.authorName || "익명"}
                            </span>
                            {r.rating != null && (
                              <span className="flex items-center gap-0.5 text-xs text-warning">
                                <Star size={10} fill="currentColor" />
                                {r.rating}
                              </span>
                            )}
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusConfig.color}`}
                            >
                              {statusConfig.label}
                            </span>
                            <span className="text-[10px] text-text-tertiary flex items-center gap-0.5">
                              <Clock size={10} />
                              {new Date(r.postedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm text-text-secondary line-clamp-2">
                            {r.body}
                          </p>
                          {r.finalReply && (
                            <div className="mt-2 p-2 bg-success-light rounded-lg border border-border-secondary">
                              <p className="text-[11px] font-semibold text-success mb-0.5">
                                승인된 답글
                              </p>
                              <p className="text-xs text-text-primary">{r.finalReply}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  editing,
  editText,
  onEditTextChange,
  onStartEdit,
  onCancelEdit,
  onApprove,
  onReject,
  actionLoading,
  naverPlaceId,
  smartPlaceReviewUrl,
}: {
  review: StoreReview;
  editing: boolean;
  editText: string;
  onEditTextChange: (s: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onApprove: (finalReply?: string) => void;
  onReject: () => void;
  actionLoading: boolean;
  naverPlaceId?: string | null;
  smartPlaceReviewUrl: string;
}) {
  return (
    <div className={`${CARD_BASE} overflow-hidden ring-1 ring-brand/10`}>
      <div className="p-4 space-y-3">
        {/* 원본 리뷰 */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-text-primary">
              {review.authorName || "익명"}
            </span>
            {review.rating != null && (
              <span className="flex items-center gap-0.5 text-xs text-warning">
                <Star size={10} fill="currentColor" />
                {review.rating}
              </span>
            )}
            <span className="text-[10px] text-text-tertiary">
              {new Date(review.postedAt).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-text-secondary bg-surface-secondary rounded-lg p-2.5 leading-relaxed">
            {review.body}
          </p>
        </div>

        {/* AI 초안 */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={12} className="text-brand" />
            <span className="text-xs font-semibold text-brand">
              AI 답글 초안
            </span>
          </div>
          {editing ? (
            <textarea
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              className="w-full text-sm p-2.5 rounded-lg border border-brand/30 focus:border-brand focus:outline-none min-h-[80px] resize-y bg-surface"
              autoFocus
            />
          ) : (
            <p className="text-sm bg-brand-subtle/50 rounded-lg p-2.5 leading-relaxed border border-brand/10 text-text-primary">
              {review.draftReply}
            </p>
          )}
        </div>

        {/* 액션 */}
        <div className="flex items-center gap-2 justify-end">
          {editing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onCancelEdit}
                disabled={actionLoading}
                className="rounded-xl h-8 text-xs border-border-primary"
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => onApprove(editText)}
                disabled={actionLoading || editText.trim().length === 0}
                className="rounded-xl h-8 text-xs bg-success hover:bg-success/90 text-white"
              >
                {actionLoading ? (
                  <Loader2 size={12} className="animate-spin mr-1" />
                ) : (
                  <Check size={12} className="mr-1" />
                )}
                수정본 승인
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(review.draftReply || "");
                  toast.success("답글이 클립보드에 복사되었습니다");
                }}
                className="rounded-xl h-8 text-xs border-brand/30 text-brand hover:bg-brand-subtle"
              >
                <Copy size={12} className="mr-1" />
                복사
              </Button>
              <a
                href={smartPlaceReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2.5 h-8 rounded-xl text-xs font-medium bg-[#03C75A] text-white hover:bg-[#02b351] transition-colors"
              >
                <ExternalLink size={12} />
                {smartPlaceReviewUrl.includes("/reviews/") ? "리뷰 답글 달기" : "스마트플레이스 열기"}
              </a>
              <Button
                variant="outline"
                size="sm"
                onClick={onStartEdit}
                disabled={actionLoading}
                className="rounded-xl h-8 text-xs border-border-primary"
              >
                <Edit2 size={12} className="mr-1" />
                수정
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onReject}
                disabled={actionLoading}
                className="rounded-xl h-8 text-xs text-text-tertiary hover:text-danger"
              >
                <X size={12} />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
