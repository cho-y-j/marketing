"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface TrafficShiftCandidate {
  keyword: string;
  gainRate: number;
  currentVolume: number;
}

export interface TrafficShiftResult {
  sourceKeyword: string;
  sourceDropRate: number;
  sourcePrevious: number;
  sourceCurrent: number;
  candidates: TrafficShiftCandidate[];
  interpretation: string | null;
  aiProvider: string | null;
}

export function useTrafficShift(storeId: string, threshold = -15) {
  return useQuery<TrafficShiftResult[]>({
    queryKey: ["traffic-shift", storeId, threshold],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/stores/${storeId}/keywords/traffic-shift`,
        { params: { threshold } },
      );
      return data;
    },
    enabled: !!storeId,
  });
}

export function useRecordVolumes(storeId: string) {
  const qc = useQueryClient();
  return useMutation<number, any, void>({
    mutationFn: async () => {
      const { data } = await apiClient.post(
        `/stores/${storeId}/keywords/traffic-shift/record`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["traffic-shift", storeId] });
    },
  });
}
