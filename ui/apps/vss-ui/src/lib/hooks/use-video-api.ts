"use client";

import { useQuery, useMutation, useQueryClient, type Query, type UseMutationOptions } from "@tanstack/react-query";

type VideoStatus = "pending" | "processing" | "ready" | "error";
type JobStatus = "queued" | "running" | "done" | "error";

export const VideoStatus = {
  pending: "pending" as const,
  processing: "processing" as const,
  ready: "ready" as const,
  error: "error" as const,
};

export const JobStatus = {
  queued: "queued" as const,
  running: "running" as const,
  done: "done" as const,
  error: "error" as const,
};

export interface Video {
  id: string;
  name: string;
  path?: string | null;
  size_bytes?: number | null;
  duration_seconds?: number | null;
  status: VideoStatus;
  error?: string | null;
  thumbnail_url?: string | null;
  created_at: string;
  updated_at?: string;
  embedding_status?: string;
  chunks_processed?: number;
  total_chunks?: number;
  progress?: number;
  stream_url?: string;
}

export interface SearchHit {
  video_id: string;
  video_name: string;
  score: number;
  timestamp_start?: number | null;
  timestamp_end?: number | null;
  description?: string | null;
  thumbnail_url?: string | null;
}

export interface SearchResult {
  query: string;
  results: SearchHit[];
  elapsed_ms?: number | null;
}

export interface QueryResult {
  question: string;
  answer: string;
  sources?: SearchHit[];
  elapsed_ms?: number | null;
  video_id?: string;
  video_name?: string;
}

export interface Job {
  id: string;
  video_id: string;
  video_name?: string;
  type?: "embedding" | "ingest" | "summarize";
  status: JobStatus;
  progress?: number | null;
  error?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Stats {
  total_videos?: number;
  ready_videos?: number;
  processing_videos?: number;
  error_videos?: number;
  total_jobs?: number;
  active_jobs?: number;
}

export const SummarizeInputStyle = {
  brief: "brief",
  detailed: "detailed",
  bullet_points: "bullet_points",
} as const;
export type SummarizeInputStyle = typeof SummarizeInputStyle[keyof typeof SummarizeInputStyle];

export interface SummaryResult {
  video_id: string;
  video_name?: string;
  summary: string;
  elapsed_ms?: number | null;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("vss_token") ?? null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type PollInterval<T> =
  | number
  | false
  | ((query: Query<T, Error, T, readonly unknown[]>) => number | false | undefined);

export function useListVideos(refetchInterval?: PollInterval<Video[]>) {
  return useQuery<Video[], Error>({
    queryKey: ["videos"],
    queryFn: async () => {
      const res = await fetch("/api/videos", { headers: authHeaders() });
      if (!res.ok) throw new Error(`Failed to fetch videos (${res.status})`);
      return res.json();
    },
    staleTime: 10_000,
    refetchInterval,
  });
}

export function useGetVideo(videoId: string, refetchInterval?: PollInterval<Video>) {
  return useQuery<Video, Error>({
    queryKey: ["video", videoId],
    queryFn: async () => {
      const res = await fetch(`/api/videos/${videoId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Failed to fetch video (${res.status})`);
      return res.json();
    },
    staleTime: 10_000,
    refetchInterval,
  });
}

export function useGetStats() {
  return useQuery<Stats, Error>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats", { headers: authHeaders() });
      if (!res.ok) throw new Error(`Failed to fetch stats (${res.status})`);
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useListJobs(refetchInterval?: PollInterval<Job[]>) {
  return useQuery<Job[], Error>({
    queryKey: ["jobs"],
    queryFn: async () => {
      const res = await fetch("/api/videos", { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to fetch videos");
      const videos: Video[] = await res.json();
      return videos
        .filter(
          (v) =>
            v.embedding_status === "processing" ||
            v.embedding_status === "pending" ||
            v.status === "processing" ||
            v.status === "pending",
        )
        .map((v) => ({
          id: `job-${v.id}`,
          video_id: v.id,
          video_name: v.name,
          type: "embedding" as const,
          status: (v.embedding_status === "processing" || v.status === "processing"
            ? "running"
            : "queued") as JobStatus,
          progress: v.progress ?? 0,
          created_at: v.created_at,
          updated_at: v.updated_at,
        }));
    },
    staleTime: 10_000,
    refetchInterval,
  });
}

interface UploadResult {
  uploaded: number;
  videos: Array<{
    videoId: string;
    filename: string;
    size: number;
    status: string;
  }>;
}

export function useUploadVideo(options?: UseMutationOptions<UploadResult, Error, File[]>) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/videos/upload?process=false", {
        method: "POST",
        body: formData,
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Upload failed (${res.status})`);
      }
      return (await res.json()) as UploadResult;
    },
    onSuccess: (data, files, context) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      options?.onSuccess?.(data, files, undefined as any, context as any);
    },
  });
}

export function useProcessVideo(options?: UseMutationOptions<any, Error, string>) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: async (videoId: string) => {
      const res = await fetch(`/api/videos/${videoId}/process`, {
        method: "POST",
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Processing failed (${res.status})`);
      }
      return await res.json();
    },
    onSuccess: (data, videoId, context) => {
      queryClient.invalidateQueries({ queryKey: ["video", videoId] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      options?.onSuccess?.(data, videoId, undefined as any, context as any);
    },
  });
}

export function useDeleteVideo(options?: UseMutationOptions<void, Error, string>) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: async (videoId: string) => {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `Delete failed (${res.status})`);
      }
    },
    onSuccess: (data, videoId, context) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      options?.onSuccess?.(data, videoId, undefined as any, context as any);
    },
  });
}

export function useSearchVideos() {
  return useMutation({
    mutationFn: async (data: { video_id: string; query: string; top_k?: number }) => {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Search failed (${res.status})`);
      }
      return (await res.json()) as SearchResult & { video_id: string };
    },
  });
}

export function useQueryVideos() {
  return useMutation({
    mutationFn: async (data: { video_id: string; question: string }) => {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.status === 202) {
        return (await res.json()) as QueryResult;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Query failed (${res.status})`);
      }
      return (await res.json()) as QueryResult;
    },
  });
}

export function useSummarizeVideo(options?: UseMutationOptions<SummaryResult, Error, { video_id: string; style?: string }>) {
  return useMutation({
    ...options,
    mutationFn: async (data: { video_id: string; style?: string }) => {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.status === 202) {
        return await res.json();
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Summarize failed (${res.status})`);
      }
      return (await res.json()) as SummaryResult;
    },
  });
}
