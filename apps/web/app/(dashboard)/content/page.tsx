"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { useKeywords } from "@/hooks/useKeywords";
import { useContents, useGenerateContent, useDeleteContent } from "@/hooks/useContent";
import { toast } from "sonner";
import { Sparkles, Copy, RefreshCw, FileText, MessageSquare, Instagram, BookOpen, Check, Loader2, Trash2, Wand2 } from "lucide-react";

const contentTypes = [
  { type: "PLACE_POST", label: "플레이스 게시글", icon: FileText, desc: "네이버 플레이스 소식", gradient: "from-blue-500 to-cyan-500" },
  { type: "REVIEW_REPLY", label: "리뷰 답변", icon: MessageSquare, desc: "고객 리뷰 답변", gradient: "from-emerald-500 to-teal-500" },
  { type: "SNS_POST", label: "SNS 포스트", icon: Instagram, desc: "인스타그램/SNS", gradient: "from-pink-500 to-rose-500" },
  { type: "BLOG_POST", label: "블로그 글", icon: BookOpen, desc: "블로그 포스트", gradient: "from-violet-500 to-purple-500" },
];

export default function ContentPage() {
  const { storeId } = useCurrentStoreId();
  const { data: keywords } = useKeywords(storeId);
  const { data: contents, isLoading } = useContents(storeId);
  const generateContent = useGenerateContent(storeId);
  const deleteContent = useDeleteContent(storeId);
  const [selectedType, setSelectedType] = useState("PLACE_POST");
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    const targetKeywords = keywords?.slice(0, 5).map((k: any) => k.keyword) ?? [];
    generateContent.mutate(
      { type: selectedType, targetKeywords },
      {
        onSuccess: () => toast.success("AI 콘텐츠가 생성되었습니다!"),
        onError: (e: any) => toast.error("콘텐츠 생성 실패: " + (e.response?.data?.message || e.message)),
      },
    );
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("클립보드에 복사되었습니다");
    setTimeout(() => setCopied(false), 2000);
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
    <div className="space-y-5 md:space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl md:text-2xl font-bold tracking-tight">AI 콘텐츠 생성</h2>
        <p className="text-sm text-muted-foreground mt-0.5">AI가 매장에 최적화된 마케팅 콘텐츠를 작성합니다</p>
      </div>

      {/* 콘텐츠 타입 선택 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {contentTypes.map((ct) => (
          <Card
            key={ct.type}
            className={`cursor-pointer transition-all active:scale-[0.98] overflow-hidden ${
              selectedType === ct.type
                ? "ring-2 ring-primary shadow-md"
                : "hover:shadow-md hover:-translate-y-0.5"
            }`}
            onClick={() => setSelectedType(ct.type)}
          >
            <CardContent className="pt-4 pb-3 px-4">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${ct.gradient} flex items-center justify-center mb-3 shadow-sm`}>
                <ct.icon size={18} className="text-white" />
              </div>
              <p className="text-sm font-semibold">{ct.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{ct.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 생성 버튼 */}
      <Button
        onClick={handleGenerate}
        disabled={generateContent.isPending}
        className="w-full md:w-auto rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shadow-md h-11 px-6"
      >
        {generateContent.isPending ? (
          <><Loader2 size={16} className="animate-spin mr-2" /> AI 생성 중...</>
        ) : (
          <><Wand2 size={16} className="mr-2" /> {selectedInfo.label} 생성하기</>
        )}
      </Button>

      {/* 생성 결과 */}
      {latestGenerated && (
        <Card className="rounded-2xl overflow-hidden border-2 border-primary/20">
          <CardHeader className="pb-2 bg-gradient-to-r from-primary/5 to-transparent flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              생성 결과
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleCopy(`${latestGenerated.title}\n\n${latestGenerated.body}`)} className="rounded-xl">
                {copied ? <><Check size={12} className="mr-1" /> 복사됨</> : <><Copy size={12} className="mr-1" /> 복사</>}
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generateContent.isPending} className="rounded-xl">
                <RefreshCw size={12} className="mr-1" /> 재생성
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <h4 className="font-bold text-base mb-3">{latestGenerated.title}</h4>
            <div className="bg-muted/30 rounded-xl p-4 mb-3">
              <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{latestGenerated.body}</p>
            </div>
            {latestGenerated.keywords?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {latestGenerated.keywords.map((tag: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[11px] bg-violet-100 text-violet-700 border-0">#{tag}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 히스토리 */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            생성 히스토리
            {history.length > 0 && <Badge variant="secondary" className="text-[10px]">{history.length}건</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-24 rounded-xl" /> : history.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mx-auto mb-3">
                <FileText size={22} className="text-purple-400" />
              </div>
              <p className="text-sm text-muted-foreground">생성된 콘텐츠가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item: any) => {
                const ct = contentTypes.find((c) => c.type === item.type);
                return (
                  <div key={item.id} className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${ct?.gradient || "from-gray-400 to-gray-500"} flex items-center justify-center shrink-0`}>
                        {ct ? <ct.icon size={14} className="text-white" /> : <FileText size={14} className="text-white" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <span className="text-[11px] text-muted-foreground">{item.createdAt?.split("T")[0]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleCopy(`${item.title}\n\n${item.body}`)} className="rounded-xl">
                        <Copy size={12} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-destructive rounded-xl">
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
