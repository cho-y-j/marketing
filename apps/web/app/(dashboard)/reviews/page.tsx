"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import {
  useReviews,
  useFetchReviews,
  useDraftReplies,
  useApproveReply,
  useRejectReply,
  StoreReview,
} from "@/hooks/useReviews";
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
} from "lucide-react";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  PENDING: { label: "수집됨", className: "bg-gray-100 text-gray-700" },
  DRAFTED: { label: "AI 초안", className: "bg-violet-100 text-violet-700" },
  APPROVED: { label: "승인됨", className: "bg-emerald-100 text-emerald-700" },
  REJECTED: { label: "거절됨", className: "bg-rose-100 text-rose-700" },
  PUBLISHED: { label: "게시됨", className: "bg-blue-100 text-blue-700" },
};

export default function ReviewsPage() {
  const { storeId } = useCurrentStoreId();
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

  return (
    <div className="space-y-5 md:space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight">
            리뷰 답글 관리
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            네이버 리뷰 수집 + AI 답글 검수 워크플로우
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetch}
            disabled={fetchMutation.isPending}
            className="rounded-xl"
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
            className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 shadow-md"
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
        {[
          { label: "전체 리뷰", value: list.length, color: "blue" },
          { label: "수집 대기", value: pending.length, color: "gray" },
          { label: "검수 대기", value: drafted.length, color: "violet" },
          { label: "승인 완료", value: approved.length, color: "emerald" },
        ].map((m) => (
          <Card key={m.label} className="overflow-hidden">
            <CardContent
              className={`pt-4 pb-3 px-4 bg-gradient-to-br from-${m.color}-500/10 to-${m.color}-500/5`}
            >
              <p className={`text-2xl font-extrabold text-${m.color}-600`}>
                {m.value}
              </p>
              <p className="text-[11px] text-muted-foreground">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 검수 대기 (DRAFTED) — 가장 중요 */}
      {drafted.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-violet-100 flex items-center justify-center">
              <Edit2 size={11} className="text-violet-600" />
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
              />
            ))}
          </div>
        </div>
      )}

      {/* 전체 리뷰 */}
      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : list.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
              <MessageSquare size={24} className="text-violet-400" />
            </div>
            <p className="text-muted-foreground font-medium">
              아직 수집된 리뷰가 없습니다
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              위 "네이버 리뷰 수집" 버튼을 눌러 시작하세요
            </p>
          </CardContent>
        </Card>
      ) : (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-muted-foreground">
            전체 리뷰 ({list.length})
          </h3>
          <div className="space-y-2">
            {list
              .filter((r) => r.replyStatus !== "DRAFTED")
              .map((r) => (
                <Card key={r.id} className="overflow-hidden">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold">
                            {r.authorName || "익명"}
                          </span>
                          {r.rating != null && (
                            <span className="flex items-center gap-0.5 text-xs text-amber-600">
                              <Star size={10} fill="currentColor" />
                              {r.rating}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[r.replyStatus]?.className || ""}`}
                          >
                            {STATUS_BADGE[r.replyStatus]?.label || r.replyStatus}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock size={10} />
                            {new Date(r.postedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {r.body}
                        </p>
                        {r.finalReply && (
                          <div className="mt-2 p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                            <p className="text-[11px] font-semibold text-emerald-700 mb-0.5">
                              승인된 답글
                            </p>
                            <p className="text-xs text-emerald-900">{r.finalReply}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
}) {
  return (
    <Card className="overflow-hidden border-violet-200/50">
      <CardContent className="py-4 px-4 space-y-3">
        {/* 원본 리뷰 */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold">
              {review.authorName || "익명"}
            </span>
            {review.rating != null && (
              <span className="flex items-center gap-0.5 text-xs text-amber-600">
                <Star size={10} fill="currentColor" />
                {review.rating}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {new Date(review.postedAt).toLocaleDateString()}
            </span>
          </div>
          <p className="text-sm text-muted-foreground bg-gray-50 rounded-lg p-2.5 leading-relaxed">
            {review.body}
          </p>
        </div>

        {/* AI 초안 */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={12} className="text-violet-500" />
            <span className="text-xs font-semibold text-violet-700">
              AI 답글 초안
            </span>
          </div>
          {editing ? (
            <textarea
              value={editText}
              onChange={(e) => onEditTextChange(e.target.value)}
              className="w-full text-sm p-2.5 rounded-lg border border-violet-200 focus:border-violet-400 focus:outline-none min-h-[80px] resize-y"
              autoFocus
            />
          ) : (
            <p className="text-sm bg-violet-50 rounded-lg p-2.5 leading-relaxed border border-violet-100">
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
                className="rounded-lg h-8 text-xs"
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={() => onApprove(editText)}
                disabled={actionLoading || editText.trim().length === 0}
                className="rounded-lg h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
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
                variant="ghost"
                size="sm"
                onClick={onReject}
                disabled={actionLoading}
                className="rounded-lg h-8 text-xs text-rose-600 hover:bg-rose-50"
              >
                <X size={12} className="mr-1" />
                거절
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onStartEdit}
                disabled={actionLoading}
                className="rounded-lg h-8 text-xs"
              >
                <Edit2 size={12} className="mr-1" />
                수정
              </Button>
              <Button
                size="sm"
                onClick={() => onApprove()}
                disabled={actionLoading}
                className="rounded-lg h-8 text-xs bg-emerald-600 hover:bg-emerald-700"
              >
                {actionLoading ? (
                  <Loader2 size={12} className="animate-spin mr-1" />
                ) : (
                  <Check size={12} className="mr-1" />
                )}
                승인
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
