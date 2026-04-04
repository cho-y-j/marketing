"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateStore } from "@/hooks/useStore";
import { Store, Loader2, MapPin } from "lucide-react";

export default function NewStorePage() {
  const router = useRouter();
  const createStore = useCreateStore();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [district, setDistrict] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createStore.mutate(
      {
        name: name.trim(),
        naverPlaceUrl: url.trim() || undefined,
        category: category.trim() || undefined,
        district: district.trim() || undefined,
      },
      {
        onSuccess: (data: any) => {
          router.push(`/stores/setup?id=${data.id}&name=${encodeURIComponent(data.name)}`);
        },
      },
    );
  };

  return (
    <div className="max-w-lg mx-auto mt-8">
      <Card>
        <CardHeader className="text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-2">
            <Store size={24} className="text-primary" />
          </div>
          <CardTitle>매장 등록</CardTitle>
          <p className="text-sm text-muted-foreground">
            매장 정보를 입력하면 AI가 자동으로 분석을 시작합니다
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">매장명 *</label>
              <Input
                placeholder="예: 홍대 맛있는 고깃집"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                네이버 플레이스 URL
                <span className="text-muted-foreground font-normal ml-1">(선택)</span>
              </label>
              <Input
                placeholder="https://map.naver.com/v5/entry/place/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                네이버 지도에서 매장 검색 후 URL을 붙여넣으세요
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">업종</label>
                <Input
                  placeholder="예: 음식점, 카페"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">지역</label>
                <Input
                  placeholder="예: 홍대, 강남"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={!name.trim() || createStore.isPending}>
              {createStore.isPending ? (
                <><Loader2 size={16} className="animate-spin mr-2" /> AI 분석 시작 중...</>
              ) : (
                <><MapPin size={16} className="mr-2" /> 매장 등록하기</>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
