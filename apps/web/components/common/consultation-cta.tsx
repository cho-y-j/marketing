"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Phone, Loader2, CheckCircle2 } from "lucide-react";

export function ConsultationCTA({
  type = "GENERAL",
  storeId,
  title = "전문 상담이 필요하신가요?",
  description = "마케팅 전문가가 매장에 맞는 전략을 제안해드립니다.",
}: {
  type?: string;
  storeId?: string;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("이름과 연락처를 입력해주세요");
      return;
    }
    setLoading(true);
    try {
      await apiClient.post("/stores/consultation", {
        name: name.trim(),
        phone: phone.trim(),
        type,
        message: message.trim() || undefined,
        storeId,
      });
      setSubmitted(true);
      toast.success("상담 신청이 완료되었습니다!");
    } catch {
      toast.error("상담 신청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4 text-center">
          <CheckCircle2 size={24} className="text-green-600 mx-auto mb-2" />
          <p className="font-semibold text-sm">상담 신청이 완료되었습니다</p>
          <p className="text-xs text-muted-foreground mt-1">빠른 시간 내에 연락드리겠습니다</p>
        </CardContent>
      </Card>
    );
  }

  if (!open) {
    return (
      <Card className="border-primary/20 bg-primary/5 hover:border-primary/40 transition-colors cursor-pointer" onClick={() => setOpen(true)}>
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Phone size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
          <Button size="sm">상담 신청</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Phone size={16} className="text-primary" />
          <p className="font-semibold text-sm">{title}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="연락처"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <Input
          placeholder="문의 내용 (선택)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={loading} className="flex-1">
            {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            상담 신청하기
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
        </div>
      </CardContent>
    </Card>
  );
}
