"use client";

import { useState } from "react";
import { useAdminUsers, useSuspendUser, useActivateUser, useDeleteUser } from "@/hooks/use-admin";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const roleBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  INDIVIDUAL: { label: "개인", variant: "secondary" },
  FRANCHISE: { label: "가맹", variant: "default" },
  SUPER_ADMIN: { label: "관리자", variant: "destructive" },
};

const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  ACTIVE: { label: "활성", variant: "default" },
  SUSPENDED: { label: "정지", variant: "destructive" },
  DELETED: { label: "삭제", variant: "outline" },
};

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useAdminUsers({
    page,
    limit: 20,
    search: search || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
  });

  const suspendMut = useSuspendUser();
  const activateMut = useActivateUser();
  const deleteMut = useDeleteUser();

  const users = data?.users || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">회원 관리</h2>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="이름, 이메일, 상호명, 전화번호"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <select
          className="border rounded-md px-3 py-2 text-sm"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
        >
          <option value="">전체 유형</option>
          <option value="INDIVIDUAL">개인사업자</option>
          <option value="FRANCHISE">가맹사업자</option>
          <option value="SUPER_ADMIN">관리자</option>
        </select>
        <select
          className="border rounded-md px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">전체 상태</option>
          <option value="ACTIVE">활성</option>
          <option value="SUSPENDED">정지</option>
          <option value="DELETED">삭제</option>
        </select>
      </div>

      {/* 테이블 */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">이름</th>
              <th className="text-left px-4 py-3 font-medium">이메일</th>
              <th className="text-left px-4 py-3 font-medium">상호명</th>
              <th className="text-center px-4 py-3 font-medium">유형</th>
              <th className="text-center px-4 py-3 font-medium">상태</th>
              <th className="text-center px-4 py-3 font-medium">매장수</th>
              <th className="text-center px-4 py-3 font-medium">플랜</th>
              <th className="text-center px-4 py-3 font-medium">가입일</th>
              <th className="text-center px-4 py-3 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">로딩 중...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">사용자가 없습니다</td></tr>
            ) : (
              users.map((user: any) => (
                <tr key={user.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${user.id}`} className="text-primary hover:underline font-medium">
                      {user.name || "-"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                  <td className="px-4 py-3">{user.companyName || "-"}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={roleBadge[user.role]?.variant || "secondary"}>
                      {roleBadge[user.role]?.label || user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={statusBadge[user.status]?.variant || "secondary"}>
                      {statusBadge[user.status]?.label || user.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">{user._count?.stores || 0}</td>
                  <td className="px-4 py-3 text-center">{user.subscriptionPlan}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {user.status === "ACTIVE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => suspendMut.mutate({ id: user.id, reason: "관리자 정지" })}
                        >
                          정지
                        </Button>
                      ) : user.status === "SUSPENDED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => activateMut.mutate(user.id)}
                        >
                          해제
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="destructive"
                        className="text-xs h-7"
                        onClick={() => {
                          if (confirm("정말 삭제하시겠습니까?")) deleteMut.mutate(user.id);
                        }}
                      >
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {pagination.totalPages} (총 {pagination.total}명)
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
