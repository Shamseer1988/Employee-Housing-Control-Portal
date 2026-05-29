"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type NotificationRow = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

type Feed = {
  rows: NotificationRow[];
  unread: number;
};

const KEY = ["notifications", "feed"] as const;
const UNREAD_KEY = ["notifications", "unread"] as const;

export function useNotificationsFeed(unreadOnly = false) {
  return useQuery({
    queryKey: [...KEY, { unreadOnly }],
    queryFn: async (): Promise<Feed> => {
      const r = await api.get("/notifications", { params: { unread_only: unreadOnly ? 1 : undefined } });
      return {
        rows: (r.data.data ?? []) as NotificationRow[],
        unread: Number(r.data.meta?.unread ?? 0),
      };
    },
    refetchInterval: 60_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: UNREAD_KEY,
    queryFn: async (): Promise<number> => {
      const r = await api.get("/notifications/unread-count");
      return Number(r.data.data?.unread ?? 0);
    },
    refetchInterval: 30_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await api.post(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post("/notifications/read-all");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
