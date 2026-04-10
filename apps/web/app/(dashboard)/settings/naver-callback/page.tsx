"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";

function NaverCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("네이버 계정을 연동하고 있습니다...");

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage("네이버 인증이 취소되었습니다");
      setTimeout(() => router.push("/settings"), 2000);
      return;
    }

    if (!code || !state) {
      setStatus("error");
      setMessage("잘못된 접근입니다");
      setTimeout(() => router.push("/settings"), 2000);
      return;
    }

    const savedState =
      typeof window !== "undefined"
        ? sessionStorage.getItem("naver_oauth_state")
        : null;
    if (savedState && savedState !== state) {
      setStatus("error");
      setMessage("보안 검증에 실패했습니다. 다시 시도해주세요.");
      setTimeout(() => router.push("/settings"), 2000);
      return;
    }

    apiClient
      .post("/auth/naver/connect", { code, state })
      .then(() => {
        setStatus("success");
        setMessage("네이버 계정이 연동되었습니다!");
        toast.success("네이버 계정 연동 완료!");
        if (typeof window !== "undefined")
          sessionStorage.removeItem("naver_oauth_state");
        setTimeout(() => router.push("/settings"), 1500);
      })
      .catch((e: any) => {
        setStatus("error");
        setMessage(
          e.response?.data?.message || "네이버 연동에 실패했습니다",
        );
        toast.error("네이버 연동 실패");
        setTimeout(() => router.push("/settings"), 3000);
      });
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        {status === "loading" && (
          <Loader2
            size={32}
            className="animate-spin text-brand mx-auto mb-4"
          />
        )}
        {status === "success" && (
          <div className="size-16 rounded-2xl bg-success-light flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-success" />
          </div>
        )}
        {status === "error" && (
          <div className="size-16 rounded-2xl bg-danger-light flex items-center justify-center mx-auto mb-4">
            <X size={32} className="text-danger" />
          </div>
        )}
        <p className="text-sm font-semibold">{message}</p>
        <p className="text-xs text-text-tertiary mt-1">
          잠시 후 설정 페이지로 이동합니다...
        </p>
      </div>
    </div>
  );
}

export default function NaverCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 size={32} className="animate-spin text-brand" />
        </div>
      }
    >
      <NaverCallbackContent />
    </Suspense>
  );
}
