"use client";

import { useState } from "react";
import {
  useKeywordRules,
  useIndustries,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
} from "@/hooks/use-admin-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, X } from "lucide-react";

export default function AdminRulesPage() {
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [adding, setAdding] = useState(false);
  const [newRule, setNewRule] = useState({
    industry: "",
    industryName: "",
    subCategory: "",
    pattern: "",
    priority: 5,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const { data: rules = [], isLoading } = useKeywordRules(selectedIndustry || undefined);
  const { data: industries = [] } = useIndustries();
  const createMut = useCreateRule();
  const updateMut = useUpdateRule();
  const deleteMut = useDeleteRule();

  const handleCreate = () => {
    createMut.mutate(newRule, {
      onSuccess: () => {
        setAdding(false);
        setNewRule({ industry: "", industryName: "", subCategory: "", pattern: "", priority: 5 });
      },
    });
  };

  const startEdit = (rule: any) => {
    setEditingId(rule.id);
    setEditForm({
      pattern: rule.pattern,
      priority: rule.priority,
      isActive: rule.isActive,
      subCategory: rule.subCategory || "",
    });
  };

  const saveEdit = (id: string) => {
    updateMut.mutate({ id, data: editForm }, { onSuccess: () => setEditingId(null) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">키워드 룰 관리</h2>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4 mr-1" /> 룰 추가
        </Button>
      </div>

      {/* 업종 필터 */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={selectedIndustry === "" ? "default" : "outline"}
          onClick={() => setSelectedIndustry("")}
        >
          전체 ({rules.length})
        </Button>
        {industries.map((ind: any) => (
          <Button
            key={ind.industry}
            size="sm"
            variant={selectedIndustry === ind.industry ? "default" : "outline"}
            onClick={() => setSelectedIndustry(ind.industry)}
          >
            {ind.industryName}
          </Button>
        ))}
      </div>

      {/* 추가 폼 */}
      {adding && (
        <div className="border rounded-lg p-4 bg-blue-50/50 space-y-3">
          <h3 className="font-semibold text-sm">새 룰 추가</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Input
              placeholder="업종 코드 (예: meat_beef)"
              value={newRule.industry}
              onChange={(e) => setNewRule({ ...newRule, industry: e.target.value })}
            />
            <Input
              placeholder="업종명 (예: 소고기집)"
              value={newRule.industryName}
              onChange={(e) => setNewRule({ ...newRule, industryName: e.target.value })}
            />
            <Input
              placeholder="세부 카테고리"
              value={newRule.subCategory}
              onChange={(e) => setNewRule({ ...newRule, subCategory: e.target.value })}
            />
            <Input
              placeholder="패턴 (예: {지역}+소고기)"
              value={newRule.pattern}
              onChange={(e) => setNewRule({ ...newRule, pattern: e.target.value })}
            />
            <Input
              type="number"
              placeholder="우선순위"
              value={newRule.priority}
              onChange={(e) => setNewRule({ ...newRule, priority: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createMut.isPending}>
              <Save className="h-3 w-3 mr-1" /> 저장
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
              <X className="h-3 w-3 mr-1" /> 취소
            </Button>
          </div>
        </div>
      )}

      {/* 룰 테이블 */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">업종</th>
              <th className="text-left px-4 py-3 font-medium">세부</th>
              <th className="text-left px-4 py-3 font-medium">패턴</th>
              <th className="text-center px-4 py-3 font-medium">우선순위</th>
              <th className="text-center px-4 py-3 font-medium">상태</th>
              <th className="text-center px-4 py-3 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </td>
              </tr>
            ) : (
              rules.map((rule: any) => (
                <tr key={rule.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{rule.industryName}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {editingId === rule.id ? (
                      <Input
                        value={editForm.subCategory}
                        onChange={(e) => setEditForm({ ...editForm, subCategory: e.target.value })}
                        className="h-7 text-xs"
                      />
                    ) : (
                      rule.subCategory || "-"
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {editingId === rule.id ? (
                      <Input
                        value={editForm.pattern}
                        onChange={(e) => setEditForm({ ...editForm, pattern: e.target.value })}
                        className="h-7 text-xs"
                      />
                    ) : (
                      rule.pattern
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingId === rule.id ? (
                      <Input
                        type="number"
                        value={editForm.priority}
                        onChange={(e) =>
                          setEditForm({ ...editForm, priority: parseInt(e.target.value) || 0 })
                        }
                        className="h-7 text-xs w-16 mx-auto"
                      />
                    ) : (
                      rule.priority
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {editingId === rule.id ? (
                      <select
                        className="border rounded px-2 py-1 text-xs"
                        value={editForm.isActive ? "true" : "false"}
                        onChange={(e) =>
                          setEditForm({ ...editForm, isActive: e.target.value === "true" })
                        }
                      >
                        <option value="true">활성</option>
                        <option value="false">비활성</option>
                      </select>
                    ) : (
                      <Badge variant={rule.isActive ? "default" : "outline"}>
                        {rule.isActive ? "활성" : "비활성"}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {editingId === rule.id ? (
                        <>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => saveEdit(rule.id)}
                            disabled={updateMut.isPending}
                          >
                            저장
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setEditingId(null)}
                          >
                            취소
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => startEdit(rule)}
                          >
                            수정
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            onClick={() => {
                              if (confirm("삭제하시겠습니까?")) deleteMut.mutate(rule.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
