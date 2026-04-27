"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Camera, Loader2, X, Wand2, Calculator } from "lucide-react";

/**
 * 매출 입력 모달.
 *
 * 사장님 룰 (자영업 60대 페르소나):
 *  - 큰 숫자 키패드 (44px+ 터치)
 *  - 카메라 1탭 — `<input capture="environment">` 모바일 직접 카메라
 *  - 사진은 base64 로 서버 전송 → Vision API + Claude 후처리 → 사장님 확인
 *  - DESIGN-apple §10: Paperlogy 상속, break-keep, 8px radius, 회색/흰색
 */

type Mode = "menu" | "manual" | "ocr-loading" | "ocr-confirm";

export function SalesInputModal({
  storeId,
  date,
  initial,
  onClose,
}: {
  storeId: string;
  date: string; // YYYY-MM-DD
  initial?: { totalAmount?: number; cardAmount?: number; cashAmount?: number; note?: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(initial?.totalAmount ? "manual" : "menu");
  const [total, setTotal] = useState(initial?.totalAmount?.toString() || "");
  const [card, setCard] = useState(initial?.cardAmount?.toString() || "");
  const [cash, setCash] = useState(initial?.cashAmount?.toString() || "");
  const [note, setNote] = useState(initial?.note || "");
  const [ocrSource, setOcrSource] = useState<"MANUAL" | "OCR">("MANUAL");
  const [ocrText, setOcrText] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/stores/${storeId}/sales`, {
          date,
          totalAmount: parseInt(total.replace(/[^0-9]/g, ""), 10) || 0,
          cardAmount: card ? parseInt(card.replace(/[^0-9]/g, ""), 10) : undefined,
          cashAmount: cash ? parseInt(cash.replace(/[^0-9]/g, ""), 10) : undefined,
          source: ocrSource,
          note: note.trim() || undefined,
          receiptText: ocrText || undefined,
        })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success("매출 저장 완료");
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["sales-roi"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "저장 실패"),
  });

  const parse = useMutation({
    mutationFn: (imageBase64: string) =>
      apiClient
        .post(`/stores/${storeId}/sales/parse-receipt`, { imageBase64 })
        .then((r) => r.data),
    onSuccess: (r: {
      totalAmount: number | null;
      cardAmount: number | null;
      cashAmount: number | null;
      rawText: string;
      confidence: "high" | "low";
    }) => {
      if (r.totalAmount == null) {
        toast.error("총매출 인식 실패 — 직접 입력해주세요");
        setMode("manual");
        return;
      }
      setTotal(String(r.totalAmount));
      if (r.cardAmount != null) setCard(String(r.cardAmount));
      if (r.cashAmount != null) setCash(String(r.cashAmount));
      setOcrSource("OCR");
      setOcrText(r.rawText);
      setMode("ocr-confirm");
      if (r.confidence === "low") {
        toast.info("인식 정확도 낮음 — 숫자 확인해주세요");
      } else {
        toast.success("영수증 인식 완료 — 확인 후 저장");
      }
    },
    onError: (e: any) => {
      toast.error(e.response?.data?.message || "영수증 인식 실패");
      setMode("manual");
    },
  });

  const handleFileChosen = (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("사진이 너무 큽니다 (8MB 이하)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setMode("ocr-loading");
      parse.mutate(result);
    };
    reader.onerror = () => toast.error("사진 읽기 실패");
    reader.readAsDataURL(file);
  };

  const formatWon = (v: string) => {
    const num = v.replace(/[^0-9]/g, "");
    if (!num) return "";
    return parseInt(num, 10).toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end md:items-center justify-center p-0 md:p-4 break-keep">
      <div className="w-full md:max-w-md bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
          <h3 className="text-base font-bold tracking-tight">
            매출 입력 <span className="text-xs text-muted-foreground font-normal ml-1">{date}</span>
          </h3>
          <button
            onClick={onClose}
            className="p-2 -m-2 inline-flex items-center justify-center min-w-[36px] min-h-[36px] rounded-md hover:bg-muted/40 text-muted-foreground"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-4 space-y-3">
          {mode === "menu" && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-white hover:bg-muted/40 transition-colors min-h-[64px]"
              >
                <div className="size-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Camera size={20} className="text-emerald-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold">📸 영수증 사진 입력</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    POS 일일정산 영수증 1장이면 끝
                  </p>
                </div>
              </button>
              <button
                onClick={() => setMode("manual")}
                className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-white hover:bg-muted/40 transition-colors min-h-[64px]"
              >
                <div className="size-10 rounded-xl bg-sky-50 flex items-center justify-center">
                  <Calculator size={20} className="text-sky-600" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-bold">⌨️ 숫자 직접 입력</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    오늘 매출 한 줄로 끝
                  </p>
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileChosen(f);
                }}
                className="hidden"
              />
            </>
          )}

          {mode === "ocr-loading" && (
            <div className="py-12 text-center">
              <Loader2 size={32} className="mx-auto text-emerald-600 animate-spin mb-3" />
              <p className="text-sm font-semibold">영수증 인식 중...</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Google Vision + AI 후처리 (10~20초)
              </p>
            </div>
          )}

          {(mode === "manual" || mode === "ocr-confirm") && (
            <>
              {mode === "ocr-confirm" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 leading-snug">
                  <strong>AI 인식 완료</strong> — 숫자 확인 후 저장하세요. 잘못 인식됐으면 직접 수정 가능.
                </div>
              )}
              {/* 총매출 — 가장 크게 */}
              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground">총 매출</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatWon(total)}
                    onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="1,250,000"
                    className="flex-1 text-2xl font-black tracking-tight border-b border-border focus:border-emerald-400 outline-none py-2 bg-transparent"
                    autoFocus={mode === "manual"}
                  />
                  <span className="text-base font-bold text-muted-foreground">원</span>
                </div>
              </label>

              {/* 카드/현금 — 보조 */}
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">카드 매출 (선택)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatWon(card)}
                    onChange={(e) => setCard(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="-"
                    className="w-full mt-1 text-base font-semibold border-b border-border focus:border-emerald-400 outline-none py-1.5 bg-transparent"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">현금 매출 (선택)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatWon(cash)}
                    onChange={(e) => setCash(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="-"
                    className="w-full mt-1 text-base font-semibold border-b border-border focus:border-emerald-400 outline-none py-1.5 bg-transparent"
                  />
                </label>
              </div>

              {/* 메모 — 광고 시작 같은 마커 */}
              <label className="block">
                <span className="text-[11px] font-medium text-muted-foreground">
                  메모 (선택) — 차트 마커로 표시
                </span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder='예: "키워드 광고 시작" / "체험단 모집"'
                  maxLength={40}
                  className="w-full mt-1 text-sm border-b border-border focus:border-emerald-400 outline-none py-1.5 bg-transparent"
                />
              </label>

              {/* 버튼 */}
              <div className="flex gap-2 pt-2">
                {mode === "ocr-confirm" && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={save.isPending}
                    className="flex-1 inline-flex items-center justify-center gap-1 min-h-[44px] rounded-xl border border-border bg-white text-sm font-medium hover:bg-muted/40"
                  >
                    <Camera size={14} /> 다시 찍기
                  </button>
                )}
                <button
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !total}
                  className="flex-1 inline-flex items-center justify-center gap-1 min-h-[44px] rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50"
                >
                  {save.isPending ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> 저장 중
                    </>
                  ) : (
                    <>
                      <Wand2 size={14} /> 저장
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
