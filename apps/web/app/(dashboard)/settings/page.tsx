"use client";

import { Store, Bell, Key, CreditCard, User, ChevronRight } from "lucide-react";

const sections = [
  {
    icon: Store,
    title: "매장 정보",
    desc: "매장명, 플레이스 URL, 카테고리",
    items: [
      { label: "매장명", value: "홍대 맛있는 고깃집" },
      { label: "카테고리", value: "음식점 > 고기/구이" },
      { label: "지역", value: "홍대" },
    ],
  },
  {
    icon: Bell,
    title: "알림 설정",
    desc: "브리핑, 경쟁사 변동, 트렌드 알림",
    items: [
      { label: "아침 브리핑", value: "매일 오전 7시" },
      { label: "경쟁사 알림", value: "켜짐" },
      { label: "트렌드 알림", value: "켜짐" },
    ],
  },
  {
    icon: Key,
    title: "API 키 설정",
    desc: "프리미엄 사용자 전용",
    items: [
      { label: "Claude API", value: "미설정" },
      { label: "연결 상태", value: "-" },
    ],
  },
  {
    icon: CreditCard,
    title: "구독 관리",
    desc: "현재 플랜 및 결제 정보",
    items: [
      { label: "현재 플랜", value: "Free" },
      { label: "만료일", value: "-" },
    ],
  },
  {
    icon: User,
    title: "계정 설정",
    desc: "프로필, 비밀번호, 로그아웃",
    items: [
      { label: "이메일", value: "test@test.com" },
      { label: "가입일", value: "2026-04-03" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-4 max-w-3xl">
      <h2 className="text-xl font-bold text-text-primary">설정</h2>

      {sections.map((section, i) => (
        <div key={i} className="bg-surface rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-3 p-4 border-b border-border">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <section.icon size={18} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-text-primary">{section.title}</h3>
              <p className="text-xs text-text-secondary">{section.desc}</p>
            </div>
          </div>
          <div>
            {section.items.map((item, j) => (
              <div
                key={j}
                className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-gray-50 cursor-pointer"
              >
                <span className="text-sm text-text-secondary">{item.label}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-text-primary">{item.value}</span>
                  <ChevronRight size={14} className="text-text-secondary" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <button className="w-full text-sm text-danger py-3 hover:bg-red-50 rounded-xl transition-colors">
        로그아웃
      </button>
    </div>
  );
}
