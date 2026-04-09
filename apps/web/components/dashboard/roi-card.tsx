"use client";

import { useState } from "react";
import { useROI, useUpdateAvgOrderValue } from "@/hooks/useROI";
import { Banknote, Eye, UserCheck, TrendingUp, Settings2 } from "lucide-react";
import { toast } from "sonner";

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
    <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Banknote size={18} className="text-emerald-600" />
          이번 달 추정 효과
        </h3>
        <button
          onClick={() => { setShowEdit(!showEdit); setAvgInput(String(roi.avgOrderValue)); }}
          className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          <Settings2 size={12} />
          객단가 설정
        </button>
      </div>

      {showEdit && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-white rounded-lg border">
          <span className="text-sm text-gray-500">객단가</span>
          <input
            type="number"
            value={avgInput}
            onChange={(e) => setAvgInput(e.target.value)}
            className="w-24 px-2 py-1 border rounded text-sm text-right"
            placeholder="20000"
          />
          <span className="text-sm text-gray-500">원</span>
          <button
            onClick={handleSave}
            disabled={updateAvg.isPending}
            className="ml-auto px-3 py-1 bg-emerald-600 text-white text-xs rounded-md hover:bg-emerald-700"
          >
            저장
          </button>
        </div>
      )}

      {hasData ? (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                <Eye size={12} />
                <span className="text-xs">추가 노출</span>
              </div>
              <p className="text-lg font-bold text-gray-900">+{roi.additionalExposure.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                <UserCheck size={12} />
                <span className="text-xs">추가 방문</span>
              </div>
              <p className="text-lg font-bold text-gray-900">+{roi.additionalVisitors}</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                <Banknote size={12} />
                <span className="text-xs">추가 매출</span>
              </div>
              <p className="text-lg font-bold text-emerald-600">+{roi.additionalRevenue.toLocaleString()}원</p>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl">
            <span className="text-sm text-gray-600">구독료 {roi.monthlyFee.toLocaleString()}원 대비</span>
            <span className="text-lg font-black text-emerald-600 flex items-center gap-1">
              <TrendingUp size={16} />
              ROI {roi.roi}배
            </span>
          </div>
        </>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">순위 데이터가 쌓이면 자동으로 ROI를 계산합니다</p>
          <p className="text-xs text-gray-400 mt-1">매일 순위를 체크하고 있어요. 며칠 후 확인해주세요!</p>
        </div>
      )}
    </div>
  );
}
