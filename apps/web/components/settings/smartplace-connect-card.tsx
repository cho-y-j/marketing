"use client";

import { useState } from "react";
import { useStore } from "@/hooks/useStore";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Store,
  ExternalLink,
  Check,
  Loader2,
  HelpCircle,
  X,
  Copy,
} from "lucide-react";

export function SmartPlaceConnectCard() {
  const { storeId } = useCurrentStoreId();
  const { data: store, refetch } = useStore(storeId);
  const [showGuide, setShowGuide] = useState(false);
  const [bizId, setBizId] = useState("");
  const [saving, setSaving] = useState(false);

  const connected = !!store?.smartPlaceBizId;

  const extractBizId = (input: string): string => {
    const trimmed = input.trim();
    // URL에서 biz ID 추출: https://new.smartplace.naver.com/bizes/123456/...
    const match = trimmed.match(/bizes\/(\d+)/);
    if (match) return match[1] as string;
    // 숫자만 입력한 경우
    if (/^\d+$/.test(trimmed)) return trimmed;
    return trimmed;
  };

  const handleSave = async () => {
    const id = extractBizId(bizId);
    if (!id) {
      toast.error("Biz ID를 입력해주세요");
      return;
    }
    setSaving(true);
    try {
      await apiClient.put(`/stores/${storeId}`, { smartPlaceBizId: id });
      toast.success("스마트플레이스가 연결되었습니다!");
      setBizId("");
      setShowGuide(false);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("스마트플레이스 연결을 해제하시겠습니까?")) return;
    try {
      await apiClient.put(`/stores/${storeId}`, { smartPlaceBizId: null });
      toast.success("연결이 해제되었습니다");
      refetch();
    } catch {
      toast.error("해제 실패");
    }
  };

  return (
    <div className="rounded-2xl border border-border-primary bg-surface shadow-sm p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[#03C75A]/10 flex items-center justify-center">
            <Store size={18} className="text-[#03C75A]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">스마트플레이스 연결</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {connected
                ? `연결됨 (ID: ${store.smartPlaceBizId})`
                : "리뷰 답글 시 바로 리뷰관리 페이지로 이동합니다"}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <a
              href={`https://new.smartplace.naver.com/bizes/${store.smartPlaceBizId}/reviews/list`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#03C75A] font-medium flex items-center gap-1 hover:underline"
            >
              <ExternalLink size={12} /> 리뷰관리 열기
            </a>
            <button
              onClick={handleDisconnect}
              className="text-xs text-text-tertiary hover:text-danger transition-colors"
            >
              해제
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#03C75A] text-white text-xs font-semibold hover:bg-[#02b351] transition-colors"
          >
            <Store size={14} />
            연결하기
          </button>
        )}
      </div>

      {showGuide && !connected && (
        <div className="border border-border-primary rounded-xl p-4 bg-surface-secondary">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-1.5">
              <HelpCircle size={14} className="text-brand" />
              스마트플레이스 Biz ID 찾는 방법
            </h4>
            <button
              onClick={() => setShowGuide(false)}
              className="text-text-tertiary hover:text-text-secondary"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3 text-xs text-text-secondary">
            <div className="flex gap-3">
              <span className="size-6 rounded-full bg-brand-subtle text-brand flex items-center justify-center shrink-0 font-bold text-[10px]">
                1
              </span>
              <div>
                <p className="font-medium text-text-primary">
                  스마트플레이스에 로그인
                </p>
                <a
                  href="https://new.smartplace.naver.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#03C75A] hover:underline flex items-center gap-0.5 mt-0.5"
                >
                  new.smartplace.naver.com <ExternalLink size={10} />
                </a>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="size-6 rounded-full bg-brand-subtle text-brand flex items-center justify-center shrink-0 font-bold text-[10px]">
                2
              </span>
              <div>
                <p className="font-medium text-text-primary">
                  내 매장을 클릭
                </p>
                <p className="mt-0.5">매장 목록에서 연결할 매장을 선택하세요</p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="size-6 rounded-full bg-brand-subtle text-brand flex items-center justify-center shrink-0 font-bold text-[10px]">
                3
              </span>
              <div>
                <p className="font-medium text-text-primary">
                  주소창에서 숫자를 복사
                </p>
                <div className="mt-1 p-2 bg-surface rounded-lg border border-border-primary font-mono text-[11px]">
                  new.smartplace.naver.com/bizes/
                  <span className="bg-warning-light text-warning font-bold px-1 rounded">
                    123456789
                  </span>
                  /home
                </div>
                <p className="mt-1">
                  노란색 부분의 숫자가 Biz ID입니다
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <span className="size-6 rounded-full bg-brand-subtle text-brand flex items-center justify-center shrink-0 font-bold text-[10px]">
                4
              </span>
              <div>
                <p className="font-medium text-text-primary">
                  아래에 붙여넣기
                </p>
                <p className="mt-0.5">
                  숫자만 넣어도 되고, URL 전체를 넣어도 자동으로 추출합니다
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <input
              type="text"
              value={bizId}
              onChange={(e) => setBizId(e.target.value)}
              placeholder="Biz ID 또는 스마트플레이스 URL 붙여넣기"
              className="flex-1 px-3 py-2 border border-border-primary rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <button
              onClick={handleSave}
              disabled={saving || !bizId.trim()}
              className="px-4 py-2 bg-brand text-white text-xs font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} />
              )}
              저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
