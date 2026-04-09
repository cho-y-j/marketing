"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface StoreReview {
  id: string;
  storeId: string;
  source: string;
  authorName: string | null;
  rating: number | null;
  body: string;
  postedAt: string;
  fetchedAt: string;
  replyStatus: "PENDING" | "DRAFTED" | "APPROVED" | "REJECTED" | "PUBLISHED";
  draftReply: string | null;
  finalReply: string | null;
  draftedAt: string | null;
  approvedAt: string | null;
}

export function useReviews(storeId: string) {
  return useQuery<StoreReview[]>({
    queryKey: ["reviews", storeId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/reviews`);
      return data;
    },
    enabled: !!storeId,
  });
}

export function usePendingReviews(storeId: string) {
  return useQuery<StoreReview[]>({
    queryKey: ["reviews", storeId, "pending"],
    queryFn: async () => {
      const { data } = await apiClient.get(`/stores/${storeId}/reviews/pending`);
      return data;
    },
    enabled: !!storeId,
  });
}

export function useFetchReviews(storeId: string) {
  const qc = useQueryClient();
  return useMutation<number, any, void>({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/stores/${storeId}/reviews/fetch`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", storeId] });
    },
  });
}

export function useDraftReplies(storeId: string) {
  const qc = useQueryClient();
  return useMutation<number, any, void>({
    mutationFn: async () => {
      const { data } = await apiClient.post(`/stores/${storeId}/reviews/draft`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", storeId] });
    },
  });
}

export function useApproveReply(storeId: string) {
  const qc = useQueryClient();
  return useMutation<
    StoreReview,
    any,
    { reviewId: string; finalReply?: string }
  >({
    mutationFn: async ({ reviewId, finalReply }) => {
      const { data } = await apiClient.post(
        `/stores/${storeId}/reviews/${reviewId}/approve`,
        { finalReply },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", storeId] });
    },
  });
}

export function useRejectReply(storeId: string) {
  const qc = useQueryClient();
  return useMutation<StoreReview, any, { reviewId: string }>({
    mutationFn: async ({ reviewId }) => {
      const { data } = await apiClient.post(
        `/stores/${storeId}/reviews/${reviewId}/reject`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reviews", storeId] });
    },
  });
}
