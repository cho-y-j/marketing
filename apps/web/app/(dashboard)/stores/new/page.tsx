"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCreateStore } from "@/hooks/useStore";
import { apiClient } from "@/lib/api-client";
import {
  Store,
  Loader2,
  MapPin,
  Search,
  CheckCircle2,
  Star,
  MessageSquare,
  FileText,
} from "lucide-react";

export default function NewStorePage() {
  const router = useRouter();
  const createStore = useCreateStore();

  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // URL인지 매장명인지 자동 판단
  const isUrl = (text: string) =>
    text.includes("naver.com") || text.includes("map.naver") || text.includes("place/");

  // 플레이스 정보 조회
  const fetchPreview = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");
    setPreview(null);

    try {
      const params = isUrl(trimmed) ? { url: trimmed } : { name: trimmed };
      const { data } = await apiClient.get("/stores/place-preview", { params });
      if (data) {
        setPreview(data);
      } else {
        setError("매장을 찾을 수 없습니다. URL을 확인하거나 다른 매장명으로 검색해보세요.");
      }
    } catch {
      setError("매장 정보 조회에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }, [input]);

  // 매장 등록 실행
  const handleRegister = () => {
    if (!preview) return;

    createStore.mutate(
      {
        name: preview.name,
        naverPlaceUrl: isUrl(input.trim())
          ? input.trim()
          : `https://map.naver.com/v5/entry/place/${preview.id || preview.placeId}`,
        category: preview.category || undefined,
        address: preview.roadAddress || preview.address || undefined,
      },
      {
        onSuccess: (data: any) => {
          router.push(`/stores/setup?id=${data.id}&name=${encodeURIComponent(data.name)}`);
        },
      },
    );
  };

  return (
    <div className="max-w-lg mx-auto mt-8 space-y-4">
      {/* 입력 카드 */}
      <Card>
        <CardHeader className="text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
            <Store size={24} className="text-primary" />
          </div>
          <CardTitle>매장 등록</CardTitle>
          <p className="text-sm text-muted-foreground">
            네이버 플레이스 URL 또는 매장명만 입력하면<br />
            나머지는 자동으로 수집됩니다
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">
                네이버 플레이스 URL 또는 매장명
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="URL 붙여넣기 또는 매장명 입력"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchPreview()}
                />
                <Button onClick={fetchPreview} disabled={!input.trim() || loading}>
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                네이버 지도에서 매장을 검색한 후 URL을 복사해서 붙여넣으세요
              </p>
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 미리보기 카드 */}
      {preview && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 mb-4">
              <CheckCircle2 size={20} className="text-primary mt-0.5 shrink-0" />
              <div className="flex-1">
                <h3 className="font-bold text-lg">{preview.name}</h3>
                {preview.category && (
                  <Badge variant="secondary" className="mt-1">
                    {preview.category}
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm">
              {(preview.roadAddress || preview.address) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin size={14} className="shrink-0" />
                  {preview.roadAddress || preview.address}
                </div>
              )}
              {preview.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-xs">TEL</span>
                  {preview.phone}
                </div>
              )}
            </div>

            {/* 지표 요약 */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              {preview.visitorReviewCount != null && (
                <div className="text-center bg-white rounded-md p-2">
                  <MessageSquare size={14} className="mx-auto text-muted-foreground mb-1" />
                  <div className="font-bold text-sm">
                    {preview.visitorReviewCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">방문자 리뷰</div>
                </div>
              )}
              {preview.blogReviewCount != null && (
                <div className="text-center bg-white rounded-md p-2">
                  <FileText size={14} className="mx-auto text-muted-foreground mb-1" />
                  <div className="font-bold text-sm">
                    {preview.blogReviewCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">블로그 리뷰</div>
                </div>
              )}
            </div>

            <div className="mt-4 p-3 bg-white rounded-md text-xs text-muted-foreground">
              <strong className="text-foreground">자동 분석 항목:</strong> 키워드 자동 생성, 경쟁 매장 탐색, 순위 조회, 검색량 분석이
              등록 즉시 자동으로 시작됩니다.
            </div>

            <Button
              className="w-full mt-4"
              size="lg"
              onClick={handleRegister}
              disabled={createStore.isPending}
            >
              {createStore.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  등록 중...
                </>
              ) : (
                <>
                  <MapPin size={16} className="mr-2" />
                  이 매장으로 등록하기
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
