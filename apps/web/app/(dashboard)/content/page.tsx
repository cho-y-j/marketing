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
import { Sparkles, Copy, RefreshCw, FileText, MessageSquare, Instagram, BookOpen, Check, Loader2, Trash2 } from "lucide-react";

const contentTypes = [
  { type: "PLACE_POST", label: "플레이스 게시글", icon: FileText, desc: "네이버 플레이스 소식" },
  { type: "REVIEW_REPLY", label: "리뷰 답변", icon: MessageSquare, desc: "고객 리뷰 답변" },
  { type: "SNS_POST", label: "SNS 포스트", icon: Instagram, desc: "인스타그램/SNS" },
  { type: "BLOG_POST", label: "블로그 글", icon: BookOpen, desc: "블로그 포스트" },
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
    // 키워드 컨텍스트를 함께 전달
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

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl">
      <h2 className="text-xl font-bold">AI 콘텐츠 생성</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {contentTypes.map((ct) => (
          <Card
            key={ct.type}
            className={`cursor-pointer transition-all ${selectedType === ct.type ? "ring-2 ring-primary" : "hover:shadow-md"}`}
            onClick={() => setSelectedType(ct.type)}
          >
            <CardContent className="pt-4 pb-3 px-4">
              <ct.icon size={20} className={selectedType === ct.type ? "text-primary" : "text-muted-foreground"} />
              <p className="text-sm font-medium mt-2">{ct.label}</p>
              <p className="text-xs text-muted-foreground">{ct.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={handleGenerate} disabled={generateContent.isPending} className="w-full md:w-auto">
        {generateContent.isPending ? <><Loader2 size={16} className="animate-spin mr-2" /> AI 생성 중...</> : <><Sparkles size={16} className="mr-2" /> AI 콘텐츠 생성하기</>}
      </Button>

      {latestGenerated && (
        <Card className="ring-2 ring-primary/20">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">생성 결과</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleCopy(`${latestGenerated.title}\n\n${latestGenerated.body}`)}>
                {copied ? <><Check size={12} className="mr-1" /> 복사됨</> : <><Copy size={12} className="mr-1" /> 복사</>}
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generateContent.isPending}>
                <RefreshCw size={12} className="mr-1" /> 재생성
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <h4 className="font-bold mb-2">{latestGenerated.title}</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed mb-3">{latestGenerated.body}</p>
            {latestGenerated.keywords?.length > 0 && (
              <div className="flex flex-wrap gap-1">{latestGenerated.keywords.map((tag: string, i: number) => <Badge key={i} variant="secondary" className="text-xs">#{tag}</Badge>)}</div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">생성 히스토리</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-24" /> : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">생성된 콘텐츠가 없습니다</p>
          ) : (
            <div className="space-y-2">
              {history.map((item: any) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-[10px]">{item.type}</Badge>
                      <span className="text-xs text-muted-foreground">{item.createdAt?.split("T")[0]}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleCopy(`${item.title}\n\n${item.body}`)}><Copy size={12} /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 size={12} /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
