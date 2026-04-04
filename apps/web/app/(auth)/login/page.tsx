"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await apiClient.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      router.push("/");
    } catch (err: any) {
      setError(err.response?.data?.message || "로그인에 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterAndLogin = async () => {
    // 빠른 테스트용: 회원가입 + 즉시 로그인
    setError("");
    setLoading(true);
    try {
      const { data } = await apiClient.post("/auth/register", {
        email,
        password,
        name: email.split("@")[0],
      });
      localStorage.setItem("token", data.token);
      router.push("/");
    } catch (err: any) {
      // 이미 가입된 경우 로그인 시도
      if (err.response?.status === 409) {
        await handleLogin({ preventDefault: () => {} } as React.FormEvent);
        return;
      }
      setError(err.response?.data?.message || "가입에 실패했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary-dark">마케팅 인텔리전스</h1>
          <p className="text-sm text-text-secondary mt-1">AI 매장 마케팅 매니저</p>
        </div>

        <div className="bg-surface rounded-xl p-6 border border-border space-y-4">
          {error && (
            <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <form className="space-y-3" onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
            />
            <input
              type="password"
              placeholder="비밀번호 (6자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              required
              minLength={6}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              로그인
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-secondary">또는</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={handleRegisterAndLogin}
            disabled={!email || !password || loading}
            className="w-full bg-gray-100 hover:bg-gray-200 text-text-primary py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            이 정보로 바로 가입 + 시작
          </button>
        </div>
      </div>
    </div>
  );
}
