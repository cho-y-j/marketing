"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary-dark">회원가입</h1>
          <p className="text-sm text-text-secondary mt-1">무료로 시작하세요</p>
        </div>

        <div className="bg-surface rounded-xl p-6 border border-border space-y-4">
          <button className="w-full flex items-center justify-center gap-2 bg-[#03C75A] hover:bg-[#02b351] text-white py-2.5 rounded-lg text-sm font-medium transition-colors">
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

          <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
            <input
              type="text"
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="password"
              placeholder="비밀번호 (6자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              disabled={!agree}
              className="w-full bg-primary hover:bg-primary-dark text-white py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
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
