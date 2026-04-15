"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConsultationCTA } from "@/components/common/consultation-cta";
import { useCurrentStoreId } from "@/hooks/useCurrentStore";
import {
  Globe, MapPin, Star, Search, Languages, Building2, Target, Info,
} from "lucide-react";

export default function ForeignMarketPage() {
  const { storeId } = useCurrentStoreId();
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold">구글 광고 유입 상담</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          내 매장 기준으로 구글 지도·검색 광고를 통해 외국인 유입을 바로 만들어드립니다
        </p>
      </div>

      {/* 메인 메시지 카드 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Target size={24} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold">노출보다 "방문으로 이어지는 유입"</h3>
              <p className="text-sm text-muted-foreground">순위가 아니라 실제 광고 유입에 집중합니다</p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              외국인 고객은 네이버가 아닌 <strong className="text-foreground">구글 지도와 검색</strong>을 통해 매장을 찾기 때문에,
              노출보다 <strong className="text-foreground">광고를 통한 즉각적인 유입 확보</strong>가 중요합니다.
            </p>
            <p>
              네이버 검색광고처럼 구글에서도
              <strong className="text-foreground"> 위치기반 노출 / 검색 광고 노출</strong>이 가능하며,
              실제로 방문으로 이어지는 유입만 집중해서 세팅합니다.
            </p>
            <p>
              상권 및 업종에 따라 광고 방식과 타겟 설정이 달라지기 때문에,
              매장 정보를 기반으로 <strong className="text-foreground">현실적인 방향</strong>으로 안내드립니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 사용자별 순위 편차 안내 */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
        <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
        <p>
          구글의 순위는 사용자의 위치, 언어, 기기에 따라 <strong>다르게 노출</strong>됩니다.
          단순 순위 지표가 아닌 아래 5가지 구조가 함께 작동해야 방문으로 이어집니다.
        </p>
      </div>

      {/* 5가지 진단 체크리스트 */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-bold text-sm mb-4">외국인 유입 구조 — 5가지 확인 요소</h3>
          <div className="space-y-3">
            <CheckItem
              num={1}
              icon={MapPin}
              title="구글 지도 등록 정확도"
              desc="주소·영업시간·전화·카테고리·사진이 정확히 등록되어 있는가"
            />
            <CheckItem
              num={2}
              icon={Star}
              title="리뷰·평점 활성도"
              desc="리뷰 수와 평점, 최근 활동이 꾸준히 유지되고 있는가"
            />
            <CheckItem
              num={3}
              icon={Languages}
              title="다국어 리뷰 구조"
              desc="외국인 기준에서도 이해 가능한 리뷰 구조가 형성되어 있는가 (자동 번역 포함)"
            />
            <CheckItem
              num={4}
              icon={Search}
              title="외국인 검색 키워드 노출"
              desc='"Korean BBQ Mapo", "Ramen near Hongdae" 등 영문 키워드로 매장이 노출되는가'
            />
            <CheckItem
              num={5}
              icon={Building2}
              title="상권 위치 적합성"
              desc="관광지·호텔·교통 접근성 등 외국인 유입이 가능한 상권인가"
            />
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      {!showDetail ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-6 text-center">
            <div className="inline-flex items-center gap-2 bg-white rounded-full px-3 py-1 mb-3 border">
              <Globe size={14} className="text-primary" />
              <span className="text-xs font-semibold">구글 광고 유입 전문 상담</span>
            </div>
            <h3 className="font-bold text-lg mb-2">
              매장 정보 남겨주시면<br />
              바로 적용 가능한 광고 방향 안내드립니다
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              상권·업종·운영 상황에 맞춘 현실적인 구글 광고 전략을 제안합니다
            </p>
            <Button
              size="lg"
              className="w-full md:w-auto px-8"
              onClick={() => setShowDetail(true)}
            >
              구글 광고 유입 상담 신청
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <ConsultationCTA
              type="FOREIGN_MARKET"
              storeId={storeId}
              title="구글 광고 유입 상담 신청"
              description="매장 정보 남겨주시면 바로 적용 가능한 광고 방향 안내드립니다."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CheckItem({
  num, icon: Icon, title, desc,
}: { num: number; icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
        <Icon size={15} className="text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-blue-600 bg-blue-100 rounded-full w-4 h-4 flex items-center justify-center">
            {num}
          </span>
          <span className="font-semibold text-sm">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 ml-5">{desc}</p>
      </div>
    </div>
  );
}
