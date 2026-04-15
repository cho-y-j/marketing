"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Phone, MessageSquare, Clock, Check, X, RefreshCw, Loader2 } from "lucide-react";

type Consultation = {
  id: string;
  name: string;
  phone: string;
  type: string;
  message: string | null;
  status: string;
  contactedAt: string | null;
  createdAt: string;
  storeId: string | null;
  userId: string | null;
};

const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "", label: "전체" },
  { key: "PENDING", label: "대기" },
  { key: "CONTACTED", label: "연락 완료" },
  { key: "COMPLETED", label: "완료" },
  { key: "CANCELLED", label: "취소" },
];

const TYPE_LABEL: Record<string, string> = {
  GENERAL: "일반 상담",
  FOREIGN_MARKET: "외국인 상권",
  BLOG: "블로그 상위노출",
  KEYWORD: "키워드 전략",
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: "대기", color: "bg-amber-50 text-amber-700 border-amber-200" },
  CONTACTED: { label: "연락 완료", color: "bg-blue-50 text-blue-700 border-blue-200" },
  COMPLETED: { label: "완료", color: "bg-green-50 text-green-700 border-green-200" },
  CANCELLED: { label: "취소", color: "bg-muted text-muted-foreground border-border" },
};

export default function AdminConsultationsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery<Consultation[]>({
    queryKey: ["admin-consultations", statusFilter],
    queryFn: async () => {
      const { data } = await apiClient.get("/admin/consultations", {
        params: statusFilter ? { status: statusFilter } : undefined,
      });
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data } = await apiClient.patch(`/admin/consultations/${id}/status`, { status });
      return data;
    },
    onSuccess: () => {
      toast.success("상태가 변경되었습니다");
      qc.invalidateQueries({ queryKey: ["admin-consultations"] });
    },
    onError: () => toast.error("변경 실패"),
  });

  const consultations = data ?? [];
  const pendingCount = consultations.filter((c) => c.status === "PENDING").length;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">상담 신청</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {statusFilter === "" && pendingCount > 0 && (
              <span className="text-amber-600 font-semibold">대기 {pendingCount}건 · </span>
            )}
            총 {consultations.length}건
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 size={14} className="animate-spin mr-1" /> : <RefreshCw size={14} className="mr-1" />}
          새로고침
        </Button>
      </div>

      {/* 상태 탭 */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
              statusFilter === t.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white hover:bg-muted/50 border-border"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            불러오는 중...
          </CardContent>
        </Card>
      ) : consultations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            상담 신청 내역이 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {consultations.map((c) => (
            <ConsultationCard
              key={c.id}
              item={c}
              onChangeStatus={(status) => updateStatus.mutate({ id: c.id, status })}
              disabled={updateStatus.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConsultationCard({
  item, onChangeStatus, disabled,
}: {
  item: Consultation;
  onChangeStatus: (status: string) => void;
  disabled: boolean;
}) {
  const statusMeta = STATUS_META[item.status] ?? STATUS_META.PENDING!;
  const typeLabel = TYPE_LABEL[item.type] ?? item.type;
  const createdAt = new Date(item.createdAt);
  const now = Date.now();
  const hoursSince = (now - createdAt.getTime()) / 1000 / 60 / 60;
  const urgent = item.status === "PENDING" && hoursSince > 24;

  return (
    <Card className={urgent ? "border-amber-300" : ""}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h4 className="font-bold text-sm">{item.name}</h4>
              <Badge variant="outline" className={`text-[10px] py-0 ${statusMeta.color}`}>
                {statusMeta.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] py-0">
                {typeLabel}
              </Badge>
              {urgent && (
                <Badge variant="outline" className="text-[10px] py-0 bg-amber-50 text-amber-700 border-amber-200">
                  24시간+ 대기
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Phone size={11} />
                <a href={`tel:${item.phone}`} className="hover:underline text-foreground font-medium">
                  {item.phone}
                </a>
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />
                {createdAt.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              {item.contactedAt && (
                <span className="inline-flex items-center gap-1 text-blue-600">
                  <Check size={11} />
                  {new Date(item.contactedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} 연락
                </span>
              )}
            </div>
            {item.message && (
              <div className="mt-2 text-xs bg-muted/30 rounded p-2 flex items-start gap-1.5">
                <MessageSquare size={11} className="text-muted-foreground mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{item.message}</span>
              </div>
            )}
          </div>

          <div className="flex gap-1.5 flex-wrap shrink-0">
            {item.status === "PENDING" && (
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs"
                onClick={() => onChangeStatus("CONTACTED")}
                disabled={disabled}
              >
                연락 완료
              </Button>
            )}
            {(item.status === "PENDING" || item.status === "CONTACTED") && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onChangeStatus("COMPLETED")}
                disabled={disabled}
              >
                완료
              </Button>
            )}
            {item.status !== "CANCELLED" && item.status !== "COMPLETED" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => {
                  if (!confirm("취소 처리하시겠습니까?")) return;
                  onChangeStatus("CANCELLED");
                }}
                disabled={disabled}
              >
                <X size={12} />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
