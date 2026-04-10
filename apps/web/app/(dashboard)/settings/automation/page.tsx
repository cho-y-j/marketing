"use client";

import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useAutoSettings, useUpdateAutoSettings, useUpdateAvgOrderValue } from "@/hooks/useROI";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import {
  Settings,
  MessageSquareText,
  FileEdit,
  TrendingUp,
  Search,
  Loader2,
  Banknote,
} from "lucide-react";

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? "bg-brand" : "bg-surface-tertiary"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function AutomationSettingsPage() {
  const { storeId } = useCurrentStoreId();
  const { data: settings, isLoading } = useAutoSettings(storeId);
  const updateSettings = useUpdateAutoSettings(storeId);
  const updateAvg = useUpdateAvgOrderValue();
  const [avgInput, setAvgInput] = useState("");

  useEffect(() => {
    if ((settings as any)?.avgOrderValue) {
      setAvgInput(String((settings as any).avgOrderValue));
    }
  }, [(settings as any)?.avgOrderValue]);

  const handleToggle = (key: string, value: boolean) => {
    updateSettings.mutate(
      { [key]: value },
      {
        onSuccess: () => toast.success("설정이 저장되었습니다"),
        onError: () => toast.error("설정 저장 실패"),
      },
    );
  };

  const handleSaveAvg = () => {
    const val = parseInt(avgInput);
    if (!val || val < 1000) {
      toast.error("객단가를 1,000원 이상 입력해주세요");
      return;
    }
    updateAvg.mutate(
      { storeId, avgOrderValue: val },
      {
        onSuccess: () => toast.success("객단가가 저장되었습니다"),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-brand" />
      </div>
    );
  }

  const automationItems = [
    {
      key: "autoReviewReply",
      icon: MessageSquareText,
      variant: "bg-info-light text-info",
      title: "리뷰 답변 자동 생성",
      desc: "새 리뷰가 수집되면 AI가 자동으로 답글 초안을 생성합니다",
      sub: "악성 리뷰는 수동 검토됩니다",
    },
    {
      key: "autoContentPublish",
      icon: FileEdit,
      variant: "bg-brand-subtle text-brand",
      title: "콘텐츠 자동 발행",
      desc: "AI가 정기적으로 콘텐츠를 자동 생성합니다",
      sub: settings?.contentPublishPerWeek
        ? `주 ${settings.contentPublishPerWeek}회`
        : "주 2회",
    },
    {
      key: "autoSeasonalKeyword",
      icon: TrendingUp,
      variant: "bg-warning-light text-warning",
      title: "시즌 키워드 자동 추가",
      desc: "시즌에 맞는 키워드를 AI가 자동으로 추가합니다",
      sub: "벚꽃, 여름, 크리스마스 등",
    },
    {
      key: "autoHiddenKeyword",
      icon: Search,
      variant: "bg-success-light text-success",
      title: "히든 키워드 자동 추가",
      desc: "AI가 매주 경쟁이 적은 히든 키워드를 발굴합니다",
      sub: "주간 자동 탐색",
    },
  ];

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">
          AI 자동화 설정
        </h2>
        <p className="text-sm text-text-secondary mt-0.5">
          AI가 자동으로 수행할 작업을 설정합니다
        </p>
      </div>

      <div className="rounded-2xl border border-border-primary bg-surface shadow-sm divide-y divide-border-primary">
        {automationItems.map((item) => (
          <div key={item.key} className="p-4 flex items-start gap-4">
            <div
              className={`size-10 rounded-xl ${item.variant} flex items-center justify-center shrink-0`}
            >
              <item.icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="text-xs text-text-secondary mt-0.5">{item.desc}</p>
              <p className="text-[10px] text-text-tertiary mt-1">{item.sub}</p>
            </div>
            <Toggle
              checked={(settings as any)?.[item.key] ?? false}
              onChange={(v) => handleToggle(item.key, v)}
              disabled={updateSettings.isPending}
            />
          </div>
        ))}
      </div>

      {/* 객단가 설정 */}
      <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="size-10 rounded-xl bg-success-light flex items-center justify-center">
            <Banknote size={18} className="text-success" />
          </div>
          <div>
            <p className="text-sm font-semibold">객단가 설정</p>
            <p className="text-xs text-text-secondary">ROI 계산에 사용됩니다</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={avgInput}
            onChange={(e) => setAvgInput(e.target.value)}
            className="w-32 px-3 py-2 border border-border-primary rounded-xl text-sm text-right bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30"
            placeholder="20000"
          />
          <span className="text-sm text-text-secondary">원</span>
          <button
            onClick={handleSaveAvg}
            disabled={updateAvg.isPending}
            className="px-4 py-2 bg-brand text-white text-xs font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
