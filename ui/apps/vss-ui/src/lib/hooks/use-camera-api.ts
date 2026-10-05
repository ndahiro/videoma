"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Query } from "@tanstack/react-query";

export interface Camera {
  id: string;
  name: string;
  location?: string | null;
  status: string;
  check_interval_seconds?: number;
  last_checked_at?: string | null;
  has_snapshot?: boolean;
  last_error?: string | null;
  consecutive_failures?: number;
  created_at: string;
  updated_at?: string;
}

export interface CameraRule {
  id: string;
  camera_id: string;
  name: string;
  keywords: string[];
  severity: string;
  cooldown_seconds?: number;
  enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export interface AlertItem {
  id: string;
  camera_id: string | null;
  camera_name?: string | null;
  rule_id: string | null;
  rule_name?: string | null;
  severity: string;
  message: string;
  caption?: string | null;
  has_frame?: boolean;
  read: boolean;
  created_at: string;
}

type PollInterval<T> =
  | number
  | false
  | ((query: Query<T, Error, T, readonly unknown[]>) => number | false | undefined);

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("vss_token") ?? null;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.json();
}

async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export function isActiveCamera(c: Camera): boolean {
  return c.status === "active";
}

export function useListCameras(refetchInterval?: PollInterval<Camera[]>) {
  return useQuery<Camera[], Error>({
    queryKey: ["cameras"],
    queryFn: () => apiGet<Camera[]>("/api/cameras"),
    staleTime: 10_000,
    refetchInterval,
  });
}

export function useListCameraRules(cameraId: string | null) {
  return useQuery<CameraRule[], Error>({
    queryKey: ["camera-rules", cameraId],
    queryFn: () => apiGet<CameraRule[]>(`/api/cameras/${cameraId}/rules`),
    enabled: Boolean(cameraId),
    staleTime: 10_000,
  });
}

export function useListAlerts(options?: {
  cameraId?: string;
  unreadOnly?: boolean;
  refetchInterval?: PollInterval<{ alerts: AlertItem[]; unread_count: number }>;
}) {
  const params = new URLSearchParams();
  if (options?.cameraId) params.set("camera_id", options.cameraId);
  if (options?.unreadOnly) params.set("unread_only", "true");
  const qs = params.toString();
  return useQuery<{ alerts: AlertItem[]; unread_count: number }, Error>({
    queryKey: ["alerts", options?.cameraId ?? null, options?.unreadOnly ? "unread" : "all"],
    queryFn: () => apiGet(`/api/alerts${qs ? `?${qs}` : ""}`),
    staleTime: 10_000,
    refetchInterval: options?.refetchInterval,
  });
}

export function useCreateCamera() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      rtsp_url: string;
      location?: string;
      check_interval_seconds?: number;
    }) => apiSend<Camera>("/api/cameras", "POST", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });
}

export function useUpdateCamera() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Record<string, unknown>) =>
      apiSend<Camera>(`/api/cameras/${id}`, "PATCH", patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
    },
  });
}

export function useDeleteCamera() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/cameras/${id}`, { method: "DELETE", headers: authHeaders() }).then(
        async (res) => {
          if (!res.ok && res.status !== 204) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.message || `Delete failed (${res.status})`);
          }
        },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useTestCamera() {
  return useMutation({
    mutationFn: (id: string) =>
      apiSend<{ ok: boolean; message: string }>(`/api/cameras/${id}/test`, "POST"),
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      cameraId,
      ...input
    }: {
      cameraId: string;
      name: string;
      keywords: string;
      severity?: string;
      cooldown_seconds?: number;
    }) => apiSend<CameraRule>(`/api/cameras/${cameraId}/rules`, "POST", input),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["camera-rules", vars.cameraId] });
    },
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      cameraId,
      ruleId,
      ...patch
    }: {
      cameraId: string;
      ruleId: string;
    } & Record<string, unknown>) =>
      apiSend<CameraRule>(`/api/cameras/${cameraId}/rules/${ruleId}`, "PATCH", patch),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["camera-rules", vars.cameraId] });
    },
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cameraId, ruleId }: { cameraId: string; ruleId: string }) =>
      fetch(`/api/cameras/${cameraId}/rules/${ruleId}`, {
        method: "DELETE",
        headers: authHeaders(),
      }).then(async (res) => {
        if (!res.ok && res.status !== 204) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || `Delete failed (${res.status})`);
        }
      }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["camera-rules", vars.cameraId] });
    },
  });
}

export function useAckAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend(`/api/alerts/${id}`, "PATCH", { read: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useAckAllAlerts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cameraId?: string) =>
      apiSend<{ marked: number }>("/api/alerts/read-all", "POST", { camera_id: cameraId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}
