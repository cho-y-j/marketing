"use client";

import { use, useState } from "react";
import { useAdminUser, useUpdateUser, useSuspendUser, useActivateUser } from "@/hooks/use-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";

export default function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: user, isLoading } = useAdminUser(id);
  const updateMut = useUpdateUser();
  const suspendMut = useSuspendUser();
  const activateMut = useActivateUser();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});

  if (isLoading) return <div className="p-8 text-muted-foreground">로딩 중...</div>;
  if (!user) return <div className="p-8 text-muted-foreground">사용자를 찾을 수 없습니다</div>;

  const startEdit = () => {
    setForm({
      name: user.name || "",
      phone: user.phone || "",
      companyName: user.companyName || "",
      businessNumber: user.businessNumber || "",
      role: user.role,
      subscriptionPlan: user.subscriptionPlan,
    });
    setEditing(true);
  };

  const saveEdit = () => {
    updateMut.mutate(
      { id, data: form },
      { onSuccess: () => setEditing(false) },
    );
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/users">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> 목록</Button>
        </Link>
        <h2 className="text-xl font-bold">회원 상세</h2>
      </div>

      {/* 기본 정보 */}
      <div className="border rounded-lg p-6 space-y-4 bg-white">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">기본 정보</h3>
          <div className="flex gap-2">
            {!editing ? (
              <Button size="sm" variant="outline" onClick={startEdit}>수정</Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>취소</Button>
                <Button size="sm" onClick={saveEdit} disabled={updateMut.isPending}>
                  <Save className="h-3 w-3 mr-1" /> 저장
                </Button>
              </>
            )}
            {user.status === "ACTIVE" ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  const reason = prompt("정지 사유를 입력하세요");
                  if (reason !== null) suspendMut.mutate({ id, reason });
                }}
              >
                정지
              </Button>
            ) : user.status === "SUSPENDED" ? (
              <Button size="sm" variant="outline" onClick={() => activateMut.mutate(id)}>
                정지 해제
              </Button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="이메일" value={user.email} />
          <Field label="이름" value={editing ? undefined : user.name}>
            {editing && <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
          </Field>
          <Field label="전화번호" value={editing ? undefined : user.phone}>
            {editing && <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
          </Field>
          <Field label="상호명" value={editing ? undefined : user.companyName}>
            {editing && <Input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />}
          </Field>
          <Field label="사업자번호" value={editing ? undefined : user.businessNumber}>
            {editing && <Input value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value })} />}
          </Field>
          <Field label="유형">
            {editing ? (
              <select
                className="border rounded-md px-3 py-2 text-sm w-full"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="INDIVIDUAL">개인사업자</option>
                <option value="FRANCHISE">가맹사업자</option>
                <option value="SUPER_ADMIN">슈퍼관리자</option>
              </select>
            ) : (
              <Badge variant="secondary">{user.role}</Badge>
            )}
          </Field>
          <Field label="구독 플랜">
            {editing ? (
              <select
                className="border rounded-md px-3 py-2 text-sm w-full"
                value={form.subscriptionPlan}
                onChange={(e) => setForm({ ...form, subscriptionPlan: e.target.value })}
              >
                <option value="FREE">FREE</option>
                <option value="BASIC">BASIC</option>
                <option value="PREMIUM">PREMIUM</option>
              </select>
            ) : (
              <Badge>{user.subscriptionPlan}</Badge>
            )}
          </Field>
          <Field label="상태">
            <Badge variant={user.status === "ACTIVE" ? "default" : "destructive"}>
              {user.status}
            </Badge>
          </Field>
          {user.suspendedAt && (
            <Field label="정지일" value={new Date(user.suspendedAt).toLocaleString("ko-KR")} />
          )}
          {user.suspendReason && <Field label="정지 사유" value={user.suspendReason} />}
          <Field label="가입일" value={new Date(user.createdAt).toLocaleString("ko-KR")} />
          <Field label="네이버 연동" value={user.naverConnectedAt ? new Date(user.naverConnectedAt).toLocaleDateString("ko-KR") : "미연동"} />
        </div>
      </div>

      {/* 매장 목록 */}
      <div className="border rounded-lg p-6 bg-white">
        <h3 className="font-semibold mb-3">등록 매장 ({user.stores?.length || 0}개)</h3>
        {user.stores?.length > 0 ? (
          <div className="space-y-2">
            {user.stores.map((store: any) => (
              <div key={store.id} className="flex items-center justify-between border rounded-md px-4 py-3">
                <div>
                  <span className="font-medium">{store.name}</span>
                  <span className="text-sm text-muted-foreground ml-2">{store.category}</span>
                  <span className="text-sm text-muted-foreground ml-2">{store.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  {store.competitiveScore != null && (
                    <Badge variant="outline">{store.competitiveScore}점</Badge>
                  )}
                  <Badge variant={store.setupStatus === "COMPLETED" ? "default" : "secondary"}>
                    {store.setupStatus}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">등록된 매장이 없습니다</p>
        )}
      </div>

      {/* 가맹 그룹 */}
      {user.franchiseGroup && (
        <div className="border rounded-lg p-6 bg-white">
          <h3 className="font-semibold mb-3">가맹 그룹: {user.franchiseGroup.name}</h3>
          <div className="space-y-2">
            {user.franchiseGroup.memberships?.map((m: any) => (
              <div key={m.store.id} className="flex items-center justify-between border rounded-md px-4 py-3">
                <span className="font-medium">{m.store.name}</span>
                <span className="text-sm text-muted-foreground">{m.store.address}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children || <p className="text-sm mt-0.5">{value || "-"}</p>}
    </div>
  );
}
