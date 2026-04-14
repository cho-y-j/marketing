import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useKeywordRules(industry?: string) {
  return useQuery({
    queryKey: ["admin", "keyword-rules", industry],
    queryFn: () =>
      apiClient
        .get("/admin/keyword-rules", { params: industry ? { industry } : {} })
        .then((r) => r.data),
  });
}

export function useIndustries() {
  return useQuery({
    queryKey: ["admin", "keyword-rules", "industries"],
    queryFn: () =>
      apiClient.get("/admin/keyword-rules/industries").then((r) => r.data),
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      industry: string;
      industryName: string;
      subCategory?: string;
      pattern: string;
      priority?: number;
    }) => apiClient.post("/admin/keyword-rules", data).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "keyword-rules"] }),
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.patch(`/admin/keyword-rules/${id}`, data).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "keyword-rules"] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete(`/admin/keyword-rules/${id}`).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin", "keyword-rules"] }),
  });
}
