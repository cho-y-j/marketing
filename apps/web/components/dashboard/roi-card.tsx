"use client";

import { useState } from "react";
import { useROI, useUpdateAvgOrderValue } from "@/hooks/useROI";
import { Banknote, Eye, UserCheck, TrendingUp, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, formatCurrency } from "@/lib/design-system";

export function ROICard({ storeId }: { storeId: string }) {
  const { data: roi } = useROI(storeId);
  const updateAvg = useUpdateAvgOrderValue();
  const [showEdit, setShowEdit] = useState(false);
  const [avgInput, setAvgInput] = useState("");

  if (!roi) return null;

  const hasData = roi.additionalExposure > 0 || roi.additionalRevenue > 0;

  const handleSave = () => {
    const val = parseInt(avgInput);
    if (!val || val < 1000) {
      toast.error("객단가를 1,000원 이상 입력해주세요");
      return;
    }
    updateAvg.mutate(
      { storeId, avgOrderValue: val },
      {
        onSuccess: () => {
          toast.success("객단가가 저장되었습니다");
          setShowEdit(false);
        },
      },
    );
  };

  return (
    <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-xl bg-success-light flex items-center justify-center">
            <Banknote size={16} className="text-success" />
          </div>
          <h3 className="text-sm font-semibold">이번 달 추정 효과</h3>
        </div>
        <button
          onClick={() => {
            setShowEdit(!showEdit);
            setAvgInput(String(roi.avgOrderValue));
          }}
          className="text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1 transition-colors"
        >
          <Settings2 size={12} />
          객단가
        </button>
      </div>

      {showEdit && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-surface-secondary rounded-xl border border-border-primary">
          <span className="text-xs text-text-secondary">객단가</span>
          <input
            type="number"
            value={avgInput}
            onChange={(e) => setAvgInput(e.target.value)}
            className="w-24 px-2 py-1.5 border border-border-primary rounded-lg text-sm text-right bg-surface"
            placeholder="20000"
          />
          <span className="text-xs text-text-secondary">원</span>
          <button
            onClick={handleSave}
            disabled={updateAvg.isPending}
            className="ml-auto px-3 py-1.5 bg-brand text-white text-xs rounded-lg hover:bg-brand-dark transition-colors"
          >
            저장
          </button>
        </div>
      )}

      {hasData ? (
        <>
          {/* 핵심 수치: 추가 매출 강조 */}
          <div className="mb-4 text-center">
            <p className="text-xs text-text-tertiary mb-1">마케팅으로 번 돈</p>
            <p className="text-3xl font-black text-success">
              +{formatCurrency(roi.additionalRevenue)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-surface-secondary p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-text-tertiary mb-1">
                <Eye size={12} />
                <span className="text-xs">추가 노출</span>
              </div>
              <p className="text-base font-bold">
                +{formatNumber(roi.additionalExposure)}
              </p>
            </div>
            <div className="rounded-xl bg-surface-secondary p-3 text-center">
              <div className="flex items-center justify-center gap-1.5 text-text-tertiary mb-1">
                <UserCheck size={12} />
                <span className="text-xs">추가 방문</span>
              </div>
              <p className="text-base font-bold">
                +{formatNumber(roi.additionalVisitors)}명
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-success-light/50 rounded-xl">
            <span className="text-xs text-text-secondary">
              구독료 대비
            </span>
            <span className="text-base font-black text-success flex items-center gap-1">
              <TrendingUp size={14} />
              ROI {roi.roi}배
            </span>
          </div>
        </>
      ) : (
        <div className="text-center py-6">
          <div className="size-12 rounded-2xl bg-surface-tertiary flex items-center justify-center mx-auto mb-3">
            <TrendingUp size={20} className="text-text-tertiary" />
          </div>
          <p className="text-sm font-medium text-text-secondary">
            데이터를 모으는 중이에요
          </p>
          <p className="text-xs text-text-tertiary mt-1">
            순위 변동이 측정되면 자동으로 ROI를 계산합니다
          </p>
        </div>
      )}
    </div>
  );
}
