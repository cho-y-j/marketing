"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useKeywords } from "@/hooks/useKeywords";
import { useContents, useGenerateContent, useDeleteContent } from "@/hooks/useContent";
import { formatNumber, CARD_BASE } from "@/lib/design-system";
import { copyText } from "@/lib/copy";
import { toast } from "sonner";
import { Sparkles, Copy, RefreshCw, FileText, MessageSquare, Instagram, BookOpen, Check, Loader2, Trash2, Wand2 } from "lucide-react";

const contentTypes = [
  { type: "PLACE_POST", label: "플레이스 게시글", icon: FileText, desc: "네이버 플레이스 소식", iconBg: "bg-info-light", iconColor: "text-info" },
  { type: "REVIEW_REPLY", label: "리뷰 답변", icon: MessageSquare, desc: "고객 리뷰 답변", iconBg: "bg-success-light", iconColor: "text-success" },
  { type: "SNS_POST", label: "SNS 포스트", icon: Instagram, desc: "인스타그램/SNS", iconBg: "bg-danger-light", iconColor: "text-danger" },
  { type: "BLOG_POST", label: "블로그 글", icon: BookOpen, desc: "블로그 포스트", iconBg: "bg-brand-subtle", iconColor: "text-brand" },
];

const VALID_TYPES = new Set(["PLACE_POST", "REVIEW_REPLY", "SNS_POST", "BLOG_POST"]);

export default function ContentPage() {
  const { storeId } = useCurrentStoreId();
  const searchParams = useSearchParams();
  const { data: keywords } = useKeywords(storeId);
  const { data: contents, isLoading } = useContents(storeId);
  const generateContent = useGenerateContent(storeId);
  const deleteContent = useDeleteContent(storeId);

  // /events 같은 다른 화면에서 딥링크로 진입 시 ?type=BLOG_POST&keyword=... prefill
  const initialType = (() => {
    const t = searchParams.get("type");
    return t && VALID_TYPES.has(t) ? t : "PLACE_POST";
  })();
  const initialKeyword = searchParams.get("keyword") || "";

  const [selectedType, setSelectedType] = useState(initialType);
  const prefillKeyword = initialKeyword; // query 로만 들어옴 — 일반 진입 시 빈 문자열
  const [copied, setCopied] = useState(false);

  // 진입 후 query param 으로 자동 한 번 생성 — 사장님이 + 버튼 누른 다음 자동 시작 의도
  useEffect(() => {
    if (initialKeyword && storeId && !generateContent.isPending && !generateContent.data) {
      generateContent.mutate(
        { type: initialType, targetKeywords: [initialKeyword] },
        {
          onSuccess: () => toast.success(`"${initialKeyword}" 으로 AI 콘텐츠 생성됨`),
          onError: (e: any) => toast.error("자동 생성 실패: " + (e.response?.data?.message || e.message)),
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleGenerate = () => {
    // 우선순위: prefillKeyword (있으면) → 매장 상위 키워드 5개
    const targetKeywords = prefillKeyword
      ? [prefillKeyword]
      : keywords?.slice(0, 5).map((k: any) => k.keyword) ?? [];
    generateContent.mutate(
      { type: selectedType, targetKeywords },
      {
        onSuccess: () => toast.success("AI 콘텐츠가 생성되었습니다!"),
        onError: (e: any) => toast.error("콘텐츠 생성 실패: " + (e.response?.data?.message || e.message)),
      },
    );
  };

  const handleCopy = async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      toast.success("클립보드에 복사되었습니다");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("복사 실패 — 길게 눌러 직접 복사해주세요");
    }
  };

  const handleDelete = (id: string) => {
    deleteContent.mutate(id, {
      onSuccess: () => toast.success("삭제되었습니다"),
      onError: () => toast.error("삭제 실패"),
    });
  };

  const latestGenerated = generateContent.data;
  const history = contents ?? [];
  const selectedInfo = contentTypes.find((ct) => ct.type === selectedType)!;

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight text-text-primary">AI 콘텐츠 생성</h2>
        <p className="text-sm text-text-secondary mt-0.5">AI가 매장에 최적화된 마케팅 콘텐츠를 작성합니다</p>
      </div>

      {/* 콘텐츠 타입 선택 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {contentTypes.map((ct) => (
          <div
            key={ct.type}
            className={`${CARD_BASE} cursor-pointer transition-all active:scale-[0.98] overflow-hidden ${
              selectedType === ct.type
                ? "ring-2 ring-brand shadow-md"
                : "hover:shadow-md hover:-translate-y-0.5"
            }`}
            onClick={() => setSelectedType(ct.type)}
          >
            <div className="p-4">
              <div className={`size-10 rounded-xl ${ct.iconBg} flex items-center justify-center mb-3`}>
                <ct.icon size={18} className={ct.iconColor} />
              </div>
              <p className="text-sm font-semibold text-text-primary">{ct.label}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">{ct.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 생성 버튼 */}
      <Button
        onClick={handleGenerate}
        disabled={generateContent.isPending}
        className="w-full md:w-auto rounded-xl bg-brand hover:bg-brand-dark text-white shadow-sm h-11 px-6"
      >
        {generateContent.isPending ? (
          <><Loader2 size={16} className="animate-spin mr-2" /> AI 생성 중...</>
        ) : (
          <><Wand2 size={16} className="mr-2" /> {selectedInfo.label} 생성하기</>
        )}
      </Button>

      {/* 생성 결과 */}
      {latestGenerated && (
        <div className={`${CARD_BASE} overflow-hidden ring-2 ring-brand/20`}>
          <div className="p-4 pb-3 bg-brand-subtle/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-brand-subtle flex items-center justify-center">
                <Sparkles size={14} className="text-brand" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary">생성 결과</h3>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleCopy(`${latestGenerated.title}\n\n${latestGenerated.body}`)} className="rounded-xl border-border-primary">
                {copied ? <><Check size={12} className="mr-1" /> 복사됨</> : <><Copy size={12} className="mr-1" /> 복사</>}
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generateContent.isPending} className="rounded-xl border-border-primary">
                <RefreshCw size={12} className="mr-1" /> 재생성
              </Button>
            </div>
          </div>
          <div className="p-4 pt-4">
            <h4 className="font-bold text-base text-text-primary mb-3">{latestGenerated.title}</h4>
            <div className="bg-surface-secondary rounded-xl p-4 mb-3">
              <p className="text-sm text-text-secondary whitespace-pre-line leading-relaxed">{latestGenerated.body}</p>
            </div>
            {latestGenerated.keywords?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {latestGenerated.keywords.map((tag: string, i: number) => (
                  <span key={i} className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-brand-subtle text-brand">#{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 히스토리 */}
      <div className={CARD_BASE}>
        <div className="p-4 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">생성 히스토리</h3>
            {history.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-surface-secondary text-text-secondary">
                {formatNumber(history.length)}건
              </span>
            )}
          </div>
        </div>
        <div className="px-4 pb-4">
          {isLoading ? <Skeleton className="h-24 rounded-xl" /> : history.length === 0 ? (
            <div className="text-center py-10">
              <div className="size-14 rounded-2xl bg-brand-subtle flex items-center justify-center mx-auto mb-3">
                <FileText size={22} className="text-brand" />
              </div>
              <p className="text-sm text-text-secondary">생성된 콘텐츠가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item: any) => {
                const ct = contentTypes.find((c) => c.type === item.type);
                return (
                  <div key={item.id} className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-surface-secondary transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`size-9 rounded-lg ${ct?.iconBg || "bg-surface-tertiary"} flex items-center justify-center shrink-0`}>
                        {ct ? <ct.icon size={14} className={ct.iconColor} /> : <FileText size={14} className="text-text-tertiary" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{item.title}</p>
                        <span className="text-[11px] text-text-tertiary">{item.createdAt?.split("T")[0]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(`${item.title}\n\n${item.body}`)} className="rounded-xl">
                        <Copy size={12} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="text-text-tertiary hover:text-danger rounded-xl">
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
