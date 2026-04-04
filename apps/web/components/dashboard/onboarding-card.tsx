"use client";

import { useState } from "react";
import { Store, Loader2 } from "lucide-react";

interface OnboardingCardProps {
  onSubmit: (data: { name: string; naverPlaceUrl?: string }) => void;
  isLoading?: boolean;
}

export function OnboardingCard({ onSubmit, isLoading }: OnboardingCardProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), naverPlaceUrl: url.trim() || undefined });
  };

  return (
    <div className="max-w-lg mx-auto mt-16">
      <div className="bg-surface rounded-xl p-8 border border-border text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Store size={28} className="text-primary" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">
          매장을 등록해보세요
        </h2>
        <p className="text-sm text-text-secondary mb-6">
          매장명만 입력하면 AI가 자동으로 분석을 시작합니다
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 text-left">
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">
              매장명 *
            </label>
            <input
              type="text"
              placeholder="예: 홍대 맛있는 고깃집"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1 block">
              네이버 플레이스 URL (선택)
            </label>
            <input
              type="text"
              placeholder="https://map.naver.com/v5/entry/place/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim() || isLoading}
            className="w-full bg-primary hover:bg-primary-dark text-white text-sm font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                AI가 분석 중입니다...
              </>
            ) : (
              "매장 등록하기"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
