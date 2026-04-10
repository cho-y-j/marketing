"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CompetitorRadarChart } from "@/components/charts/competitor-radar-chart";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useCompetitors, useAddCompetitor, useDeleteCompetitor, useCompetitorComparison } from "@/hooks/useCompetitors";
import { useCompetitorAlerts } from "@/hooks/useROI";
import { apiClient } from "@/lib/api-client";
import { formatNumber, CARD_BASE } from "@/lib/design-system";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  Users,
  MessageSquare,
  Search,
  Crown,
  ArrowUp,
  ArrowDown,
  Bell,
  TrendingUp,
  AlertTriangle,
  Swords,
  FileEdit,
  Sparkles,
} from "lucide-react";

type TabKey = "compare" | "alerts";

export default function CompetitorsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: competitors, isLoading, refetch } = useCompetitors(storeId);
  const { data: comparison } = useCompetitorComparison(storeId);
  const { data: alerts, isLoading: alertsLoading } = useCompetitorAlerts(storeId);
  const addComp = useAddCompetitor(storeId);
  const deleteComp = useDeleteCompetitor(storeId);
  const [newName, setNewName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("compare");

  const comps = competitors ?? [];
  const myStore = comparison?.store;
  const compData = comparison?.competitors ?? [];
  const alertItems = alerts ?? [];

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    if (name.length < 2) {
      toast.error("매장명을 2글자 이상 입력해주세요");
      return;
    }
    if (comps.some((c: any) => c.competitorName === name)) {
      toast.error("이미 등록된 경쟁 매장입니다");
      return;
    }
    if (!confirm(`"${name}"을(를) 경쟁 매장으로 추가할까요?\n네이버에서 매장 정보를 자동으로 검색합니다.`)) return;
    addComp.mutate({ competitorName: name }, {
      onSuccess: () => {
        toast.success(`"${name}" 추가 완료! 네이버에서 데이터 수집 중...`);
        setNewName("");
        setTimeout(() => refetch(), 5000);
      },
      onError: (e: any) => toast.error(e.response?.data?.message || "추가 실패"),
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      toast.info("경쟁 매장 데이터를 수집하고 있습니다...");
      await apiClient.post(`/stores/${storeId}/competitors/refresh`);
      toast.success("경쟁 매장 데이터 수집 완료!");
      refetch();
    } catch {
      toast.error("데이터 수집 실패");
    } finally {
      setRefreshing(false);
    }
  };

  const firstComp = compData[0];
  const radarData = firstComp && myStore ? [
    { metric: "블로그 리뷰", myStore: myStore.blogReviewCount ?? 0, competitor: firstComp.blogReviewCount ?? 0 },
    { metric: "영수증 리뷰", myStore: myStore.receiptReviewCount ?? 0, competitor: firstComp.receiptReviewCount ?? 0 },
    { metric: "일 검색량", myStore: myStore.dailySearchVolume ?? 0, competitor: firstComp.dailySearchVolume ?? 0 },
  ] : [];

  const CompareCell = ({ my, their, unit }: { my: number; their: number; unit: string }) => {
    const diff = my - their;
    return (
      <div className="text-center">
        <p className="text-sm font-bold">{formatNumber(their)}<span className="text-[10px] text-text-tertiary font-normal">{unit}</span></p>
        {diff !== 0 && (
          <span className={`text-[10px] font-medium flex items-center justify-center gap-0.5 ${diff > 0 ? "text-success" : "text-danger"}`}>
            {diff > 0 ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
            {formatNumber(Math.abs(diff))}
          </span>
        )}
      </div>
    );
  };

  const alertTypeIcon: Record<string, React.ElementType> = {
    REVIEW_INCREASE: TrendingUp,
    RANK_CHANGE: ArrowUp,
    NEW_CONTENT: FileEdit,
    WARNING: AlertTriangle,
  };

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "compare", label: "경쟁 비교", icon: Swords },
    { key: "alerts", label: "알림 히스토리", icon: Bell },
  ];

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary">경쟁 비교</h2>
          <p className="text-sm text-text-secondary mt-0.5">{comps.length}개 경쟁 매장 추적 중</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || comps.length === 0} className="rounded-xl border-border-primary">
          {refreshing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <RefreshCw size={14} className="mr-1.5" />}
          데이터 수집
        </Button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 p-1 bg-surface-secondary rounded-xl">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-surface shadow-sm text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <tab.icon size={14} />
            {tab.label}
            {tab.key === "alerts" && alertItems.filter((a) => !a.isRead).length > 0 && (
              <span className="size-4 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                {alertItems.filter((a) => !a.isRead).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "compare" ? (
        <>
          {/* 경쟁매장 추가 */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input
                placeholder="경쟁 매장명 입력 (예: 옆집 고깃집)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="pl-10 rounded-xl h-11"
              />
            </div>
            <Button onClick={handleAdd} disabled={addComp.isPending || !newName.trim()} className="rounded-xl h-11 px-6 bg-brand hover:bg-brand-dark text-white">
              {addComp.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
            </Button>
          </div>

          {/* 내 매장 vs 경쟁매장 요약 */}
          {myStore && compData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className={`${CARD_BASE} overflow-hidden ring-2 ring-brand/20`}>
                <div className="p-4 bg-brand-subtle/30">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center">
                      <Crown size={14} className="text-brand" />
                    </div>
                    <span className="text-sm font-bold text-text-primary">내 매장</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">영수증 리뷰</span>
                      <span className="font-bold text-text-primary">{formatNumber(myStore.receiptReviewCount ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">블로그 리뷰</span>
                      <span className="font-bold text-text-primary">{formatNumber(myStore.blogReviewCount ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-text-secondary">일 검색량</span>
                      <span className="font-bold text-text-primary">{formatNumber(myStore.dailySearchVolume ?? 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {compData.slice(0, 2).map((c: any, i: number) => (
                <div key={c.id || i} className={`${CARD_BASE} overflow-hidden`}>
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="size-7 rounded-lg bg-danger-light flex items-center justify-center">
                        <span className="text-[10px] font-bold text-danger">{i + 1}</span>
                      </div>
                      <span className="text-sm font-bold text-text-primary truncate">{c.name}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">영수증 리뷰</span>
                        <CompareCell my={myStore.receiptReviewCount ?? 0} their={c.receiptReviewCount ?? 0} unit="" />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">블로그 리뷰</span>
                        <CompareCell my={myStore.blogReviewCount ?? 0} their={c.blogReviewCount ?? 0} unit="" />
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-text-secondary">일 검색량</span>
                        <CompareCell my={myStore.dailySearchVolume ?? 0} their={c.dailySearchVolume ?? 0} unit="" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 레이더 차트 */}
          {radarData.length > 0 && (
            <CompetitorRadarChart
              data={radarData}
              myStoreName={myStore?.name ?? "내 매장"}
              competitorName={firstComp?.name ?? "경쟁매장"}
            />
          )}

          {/* 경쟁 매장 목록 */}
          {isLoading ? <Skeleton className="h-48 w-full rounded-2xl" /> : comps.length === 0 ? (
            <div className={CARD_BASE}>
              <div className="py-16 text-center">
                <div className="size-16 rounded-2xl bg-danger-light flex items-center justify-center mx-auto mb-4">
                  <Users size={24} className="text-danger" />
                </div>
                <p className="text-text-secondary font-medium">등록된 경쟁 매장이 없습니다</p>
                <p className="text-sm text-text-tertiary mt-1">위에서 경쟁 매장을 추가하세요</p>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-semibold text-text-secondary mb-3">전체 경쟁 매장 ({comps.length})</h3>
              <div className="space-y-2">
                {comps.map((c: any, i: number) => (
                  <div key={c.id || i} className={`${CARD_BASE} overflow-hidden hover:shadow-md transition-all`}>
                    <div className="py-3 px-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`size-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                            c.type === "AUTO" ? "bg-brand-subtle text-brand" : "bg-info-light text-info"
                          }`}>
                            {i + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm text-text-primary truncate">{c.competitorName}</p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                c.type === "AUTO" ? "bg-brand-subtle text-brand" : "bg-surface-secondary text-text-secondary"
                              }`}>
                                {c.type === "AUTO" ? "AI추천" : "직접추가"}
                              </span>
                            </div>
                            <div className="flex gap-3 text-[11px] text-text-tertiary mt-1">
                              {c.blogReviewCount != null && <span className="flex items-center gap-0.5"><MessageSquare size={10} /> 블로그 {formatNumber(c.blogReviewCount)}</span>}
                              {c.receiptReviewCount != null && <span className="flex items-center gap-0.5"><Users size={10} /> 방문자 {formatNumber(c.receiptReviewCount)}</span>}
                              {c.dailySearchVolume != null && <span className="flex items-center gap-0.5"><Search size={10} /> {formatNumber(c.dailySearchVolume)}/일</span>}
                              {!c.blogReviewCount && !c.receiptReviewCount && (
                                <span className="text-text-tertiary">데이터 수집 중...</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (!confirm(`"${c.competitorName}" 경쟁 매장을 삭제할까요?`)) return;
                            deleteComp.mutate(c.id, {
                              onSuccess: () => toast.success(`"${c.competitorName}" 삭제됨`),
                              onError: () => toast.error("삭제 실패"),
                            });
                          }}
                          disabled={deleteComp.isPending}
                          className="text-text-tertiary hover:text-danger shrink-0 rounded-xl"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* 알림 히스토리 탭 */
        <div>
          {alertsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
            </div>
          ) : alertItems.length === 0 ? (
            <div className={CARD_BASE}>
              <div className="py-16 text-center">
                <div className="size-16 rounded-2xl bg-surface-tertiary flex items-center justify-center mx-auto mb-4">
                  <Bell size={24} className="text-text-tertiary" />
                </div>
                <p className="text-text-secondary font-medium">경쟁사 알림이 없습니다</p>
                <p className="text-sm text-text-tertiary mt-1">경쟁 매장의 변화가 감지되면 알림이 표시됩니다</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {alertItems.map((alert) => {
                const AlertIcon = alertTypeIcon[alert.alertType] ?? AlertTriangle;
                return (
                  <div
                    key={alert.id}
                    className={`${CARD_BASE} overflow-hidden ${!alert.isRead ? "border-l-2 border-l-brand" : ""}`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="size-7 rounded-lg bg-danger-light flex items-center justify-center shrink-0 mt-0.5">
                          <AlertIcon size={14} className="text-danger" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-danger px-1.5 py-0.5 bg-danger-light rounded-md">
                              {alert.competitorName}
                            </span>
                            <span className="text-[10px] text-text-tertiary">
                              {new Date(alert.createdAt).toLocaleDateString("ko-KR", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-text-primary font-medium mt-1.5">
                            {alert.detail}
                          </p>

                          {/* AI 추천 */}
                          {alert.aiRecommendation && (
                            <div className="mt-3 p-3 bg-brand-subtle/30 rounded-xl">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Sparkles size={12} className="text-brand" />
                                <span className="text-[11px] font-semibold text-brand">AI 추천</span>
                              </div>
                              <p className="text-xs text-text-secondary leading-relaxed">
                                {alert.aiRecommendation}
                              </p>
                              <Link
                                href="/content"
                                className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-brand hover:text-brand-dark transition-colors"
                              >
                                <FileEdit size={12} />
                                대응 콘텐츠 만들기
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
