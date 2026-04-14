"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConsultationCTA } from "@/components/common/consultation-cta";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import { Globe, MapPin, Star, Search, CheckCircle2 } from "lucide-react";

export default function ForeignMarketPage() {
  const { storeId } = useCurrentStoreId();
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold">외국인 상권 진단</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          우리 매장에 외국인 고객 유입이 가능한지 확인해보세요
        </p>
      </div>

      {/* 안내 카드 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Globe size={24} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold">외국인 고객은 네이버가 아닙니다</h3>
              <p className="text-sm text-muted-foreground">구글 지도와 검색을 통해 매장을 찾습니다</p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              많은 매장에서 <strong className="text-foreground">구글 순위만 올리면 된다</strong>고 생각하지만,
              실제로는 단순 순위보다 <strong className="text-foreground">검색광고 + 지도 노출 + 리뷰 구조</strong>가
              함께 작동해야 방문으로 이어집니다.
            </p>
            <p>
              상권이나 업종에 따라 접근 방식이 달라서
              일반적인 정보만으로는 적용이 어려운 경우가 많습니다.
            </p>
          </div>

          {/* 체크 포인트 */}
          <div className="mt-5 space-y-2">
            <CheckItem icon={MapPin} text="구글 지도에 매장이 정확히 등록되어 있는가" />
            <CheckItem icon={Star} text="구글 리뷰에 영문 리뷰가 존재하는가" />
            <CheckItem icon={Search} text="영문 검색 시 매장이 노출되는가" />
            <CheckItem icon={Globe} text="상권 특성상 외국인 유입이 가능한 위치인가" />
          </div>
        </CardContent>
      </Card>

      {/* CTA 버튼 */}
      {!showDetail ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button
            size="lg"
            className="h-auto py-4 flex-col gap-1"
            onClick={() => setShowDetail(true)}
          >
            <span className="font-bold">무료 진단 받아보기</span>
            <span className="text-xs opacity-80">현재 매장 기준 간단 진단</span>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-auto py-4 flex-col gap-1"
            onClick={() => setShowDetail(true)}
          >
            <span className="font-bold">우리 매장 가능성 확인</span>
            <span className="text-xs opacity-60">상권/업종 분석</span>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-auto py-4 flex-col gap-1"
            onClick={() => setShowDetail(true)}
          >
            <span className="font-bold">외국인 유입 체크하기</span>
            <span className="text-xs opacity-60">구글 지도 노출 확인</span>
          </Button>
        </div>
      ) : (
        /* 상담 신청 폼 */
        <Card>
          <CardContent className="p-6">
            <p className="text-sm mb-1">
              현재 매장 기준으로 외국인 유입 구조를 간단히 확인해드리고 있습니다.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              지역 / 업종 / 현재 운영 상황에 따라 추천 방식이 달라지기 때문에
              매장 정보를 간단히 알려주시면 현실적인 방향 위주로 안내드리겠습니다.
            </p>
            <ConsultationCTA
              type="FOREIGN_MARKET"
              storeId={storeId}
              title="외국인 유입 진단 신청"
              description="매장 정보를 남겨주시면 전문가가 분석 후 연락드립니다"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CheckItem({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
        <Icon size={14} className="text-blue-500" />
      </div>
      <span>{text}</span>
    </div>
  );
}
