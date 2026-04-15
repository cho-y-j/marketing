"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Loader2, User, Building2 } from "lucide-react";

type Role = "INDIVIDUAL" | "FRANCHISE";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("INDIVIDUAL");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) return toast.error("이용약관에 동의해주세요");
    if (!name.trim()) return toast.error("이름을 입력하세요");
    if (!email.trim()) return toast.error("이메일을 입력하세요");
    if (password.length < 6) return toast.error("비밀번호 6자 이상");

    setLoading(true);
    try {
      const { data } = await apiClient.post("/auth/register", {
        email: email.trim(),
        password,
        name: name.trim(),
        role,
        phone: phone.trim() || undefined,
        companyName: companyName.trim() || undefined,
        businessNumber: businessNumber.trim() || undefined,
      });
      if (data?.token) localStorage.setItem("token", data.token);
      toast.success("가입 완료 — 매장을 등록해주세요");
      router.push("/");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "가입 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary-dark">회원가입</h1>
          <p className="text-sm text-text-secondary mt-1">무료로 시작하세요</p>
        </div>

        <div className="bg-surface rounded-xl p-6 border border-border space-y-4">
          {/* 회원 유형 선택 */}
          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-2">회원 유형</label>
            <div className="grid grid-cols-2 gap-2">
              <RoleCard
                active={role === "INDIVIDUAL"}
                onClick={() => setRole("INDIVIDUAL")}
                icon={User}
                title="개인사업자"
                desc="단일 매장 운영"
              />
              <RoleCard
                active={role === "FRANCHISE"}
                onClick={() => setRole("FRANCHISE")}
                icon={Building2}
                title="가맹사업자"
                desc="다수 가맹점 관리"
              />
            </div>
          </div>

          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 bg-[#03C75A] hover:bg-[#02b351] text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.5 10.5L6.2 0H0v20h6.5V9.5L13.8 20H20V0h-6.5z" />
            </svg>
            네이버로 가입하기
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-secondary">또는</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="이름 *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="email"
              placeholder="이메일 *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="password"
              placeholder="비밀번호 (6자 이상) *"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="tel"
              placeholder="연락처 (선택)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="text"
              placeholder={role === "FRANCHISE" ? "가맹본사 상호명 (선택)" : "상호명 (선택)"}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="text"
              placeholder="사업자등록번호 (선택)"
              value={businessNumber}
              onChange={(e) => setBusinessNumber(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <label className="flex items-start gap-2 text-xs text-text-secondary">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="mt-0.5"
              />
              <span>이용약관 및 개인정보처리방침에 동의합니다</span>
            </label>
            <button
              type="submit"
              disabled={!agree || loading}
              className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              가입하기
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-text-secondary mt-4">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-primary hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}

function RoleCard({
  active, onClick, icon: Icon, title, desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-lg border-2 text-left transition-all ${
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-white hover:border-primary/30"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={active ? "text-primary" : "text-muted-foreground"} />
        <span className={`font-semibold text-sm ${active ? "text-primary" : ""}`}>{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground">{desc}</p>
    </button>
  );
}
