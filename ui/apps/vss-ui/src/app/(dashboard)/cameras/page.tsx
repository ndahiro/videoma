"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  useListCameras,
  useCreateCamera,
  useUpdateCamera,
  useDeleteCamera,
  useTestCamera,
  useListCameraRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useListAlerts,
  useAckAlert,
  useAckAllAlerts,
  type Camera,
  type CameraRule,
} from "@/lib/hooks/use-camera-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Camera as CameraIcon,
  Plus,
  Trash2,
  Pause,
  Play,
  RefreshCw,
  Bell,
  CheckCheck,
  FlaskConical,
  Settings2,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const cameraStatusMeta: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Live", variant: "default" },
  paused: { label: "Paused", variant: "outline" },
  error: { label: "Error", variant: "destructive" },
};

const severityMeta: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  critical: { label: "Critical", variant: "destructive" },
  warning: { label: "Warning", variant: "default" },
  info: { label: "Info", variant: "secondary" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function CamerasPage() {
  const { data: cameras, isLoading: camerasLoading, refetch: refetchCameras } =
    useListCameras((query) =>
      query.state.data?.some((c) => c.status === "active") ? 15_000 : false,
    );
  const { data: alertsData } = useListAlerts({ refetchInterval: 5000 });
  const alerts = alertsData?.alerts ?? [];
  const unreadCount = alertsData?.unread_count ?? 0;
  const { toast } = useToast();

  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rulesFor, setRulesFor] = useState<Camera | null>(null);
  const [watching, setWatching] = useState<Camera | null>(null);

  // Toast once per new alert while the page is open.
  const [seenAlertIds, setSeenAlertIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const fresh = alerts.filter((a) => !a.read && !seenAlertIds.has(a.id));
    if (fresh.length > 0) {
      const latest = fresh[0];
      toast({
        title: `Incident: ${latest.camera_name ?? "Camera"}`,
        description: latest.message,
        variant: "destructive",
      });
      setSeenAlertIds((prev) => {
        const next = new Set(prev);
        fresh.forEach((a) => next.add(a.id));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertsData]);

  const createMutation = useCreateCamera();
  const updateMutation = useUpdateCamera();
  const deleteMutation = useDeleteCamera();
  const testMutation = useTestCamera();
  const ackMutation = useAckAlert();
  const ackAllMutation = useAckAllAlerts();

  const handleTest = async (camera: Camera) => {
    try {
      const result = await testMutation.mutateAsync(camera.id);
      toast({
        title: result.ok ? "Stream reachable" : "Stream unreachable",
        description: result.message,
        variant: result.ok ? "default" : "destructive",
      });
      refetchCameras();
    } catch (err) {
      toast({
        title: "Test failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  let libraryContent: ReactNode;
  if (camerasLoading) {
    libraryContent = (
      <div className="p-6 space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-12 bg-secondary" />
        ))}
      </div>
    );
  } else if (!cameras || cameras.length === 0) {
    libraryContent = (
      <div className="px-6 py-16 text-center">
        <div className="inline-flex w-10 h-10 items-center justify-center border border-border mb-4">
          <CameraIcon className="w-4 h-4 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <h3 className="font-serif text-lg tracking-editorial">No cameras yet</h3>
        <p className="mt-2 text-xs text-muted-foreground">
          Add an RTSP camera to start live monitoring.
        </p>
      </div>
    );
  } else {
    libraryContent = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-6 py-3 text-left eyebrow">Camera</th>
              <th className="px-6 py-3 text-left eyebrow">Status</th>
              <th className="px-6 py-3 text-left eyebrow">Last check</th>
              <th className="px-6 py-3 text-right eyebrow">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cameras.map((camera) => {
              const meta = cameraStatusMeta[camera.status] ?? cameraStatusMeta.paused;
              return (
                <tr key={camera.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="min-w-0">
                      <div className="truncate text-foreground">{camera.name}</div>
                      {camera.location && (
                        <div className="text-xs text-muted-foreground truncate">
                          {camera.location}
                        </div>
                      )}
                      {camera.status === "error" && camera.last_error && (
                        <div className="text-xs text-destructive truncate max-w-md">
                          {camera.last_error}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </td>
                  <td className="px-6 py-3.5 timecode text-muted-foreground text-xs">
                    {camera.last_checked_at ? timeAgo(camera.last_checked_at) : "—"}
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setWatching(camera)}
                        aria-label="Live view"
                      >
                        <Eye className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setRulesFor(camera)}
                        aria-label="Incident rules"
                      >
                        <Settings2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleTest(camera)}
                        aria-label="Test stream"
                      >
                        <FlaskConical className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          updateMutation.mutate({
                            id: camera.id,
                            status: camera.status === "active" ? "paused" : "active",
                          })
                        }
                        aria-label={camera.status === "active" ? "Pause" : "Resume"}
                      >
                        {camera.status === "active" ? (
                          <Pause className="w-3.5 h-3.5" strokeWidth={1.75} />
                        ) : (
                          <Play className="w-3.5 h-3.5" strokeWidth={1.75} />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:text-destructive"
                        onClick={() => setDeleteId(camera.id)}
                        aria-label="Delete camera"
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        index="06"
        title="Cameras"
        description="Live RTSP cameras, incident rules and the alert feed."
        meta="Cameras"
        loading={camerasLoading}
        actions={
          <>
            <Button variant="outline" onClick={() => refetchCameras()} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
              Refresh
            </Button>
            <Button onClick={() => setAddOpen(true)} className="gap-2">
              <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
              Add camera
            </Button>
          </>
        }
      />

      <section className="px-8 pt-8">
        <Card>
          <div className="px-6 pt-5 pb-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CameraIcon className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <h2 className="font-serif text-base tracking-editorial">Live cameras</h2>
            </div>
            <span className="timecode text-[11px] text-muted-foreground uppercase">
              {cameras?.length ?? 0} entries
            </span>
          </div>
          <CardContent className="pt-0 px-0">{libraryContent}</CardContent>
        </Card>
      </section>

      <section className="px-8 pt-6 pb-10">
        <Card>
          <div className="px-6 pt-5 pb-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Bell className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <h2 className="font-serif text-base tracking-editorial">Incident feed</h2>
              {unreadCount > 0 && (
                <Badge variant="destructive">{unreadCount} unread</Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => ackAllMutation.mutate(undefined)}
                disabled={ackAllMutation.isPending}
              >
                <CheckCheck className="w-3.5 h-3.5" strokeWidth={1.75} />
                Mark all read
              </Button>
            )}
          </div>
          <CardContent className="pt-0 px-0">
            {alerts.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <span className="eyebrow block mb-2">Quiet</span>
                <p className="text-sm text-muted-foreground">
                  No incidents yet. Add a rule to a camera to start watching.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {alerts.map((alert) => {
                  const sev = severityMeta[alert.severity] ?? severityMeta.info;
                  return (
                    <li
                      key={alert.id}
                      className={`flex items-center gap-4 px-6 py-3 ${alert.read ? "opacity-60" : ""}`}
                    >
                      <Badge variant={sev.variant}>{sev.label}</Badge>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate text-foreground">
                          {alert.message}
                        </div>
                        <div className="timecode text-[10px] text-muted-foreground">
                          {alert.camera_name ?? "Camera"} · {timeAgo(alert.created_at)}
                          {alert.rule_name ? ` · ${alert.rule_name}` : ""}
                        </div>
                      </div>
                      {alert.has_frame && (
                        <a
                          href={`/api/alerts/${alert.id}/frame`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] timecode uppercase text-muted-foreground hover:text-foreground"
                        >
                          Frame
                        </a>
                      )}
                      {!alert.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => ackMutation.mutate(alert.id)}
                        >
                          Acknowledge
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <AddCameraDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => {
          setAddOpen(false);
          refetchCameras();
        }}
      />

      <RulesDialog camera={rulesFor} onClose={() => setRulesFor(null)} />

      <WatchDialog camera={watching} onClose={() => setWatching(null)} />

      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif tracking-editorial">
              Remove camera
            </DialogTitle>
            <DialogDescription>
              This camera, its rules and its alerts will be removed. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddCameraDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const createMutation = useCreateCamera();
  const testMutation = useTestCamera();
  const [name, setName] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [location, setLocation] = useState("");
  const [interval, setInterval] = useState("60");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const camera = await createMutation.mutateAsync({
        name,
        rtsp_url: rtspUrl,
        location: location || undefined,
        check_interval_seconds: Number(interval) || 60,
      });
      toast({ title: "Camera added", description: `${camera.name} will be checked soon.` });
      // Verify the stream right away so a typo surfaces immediately.
      try {
        const result = await testMutation.mutateAsync(camera.id);
        if (!result.ok) {
          toast({ title: "Stream unreachable", description: result.message, variant: "destructive" });
        }
      } catch {
        // Non-fatal: the monitor will retry on its own schedule.
      }
      setName("");
      setRtspUrl("");
      setLocation("");
      setInterval("60");
      onCreated();
    } catch (err) {
      toast({
        title: "Could not add camera",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-serif tracking-editorial">Add camera</DialogTitle>
          <DialogDescription>
            Point at an RTSP (or HTTP video) stream. The monitor grabs a frame
            on a schedule and checks it against your incident rules.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <span className="eyebrow">Name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Gate camera"
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <span className="eyebrow">Stream URL</span>
            <Input
              value={rtspUrl}
              onChange={(e) => setRtspUrl(e.target.value)}
              placeholder="rtsp://camera.local:554/stream"
              className="h-11 font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="eyebrow">Location (optional)</span>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="North gate"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <span className="eyebrow">Check every (sec)</span>
              <Input
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                inputMode="numeric"
                placeholder="60"
                className="h-11"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add camera"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RulesDialog({ camera, onClose }: { camera: Camera | null; onClose: () => void }) {
  const { toast } = useToast();
  const { data: rules } = useListCameraRules(camera?.id ?? null);
  const createMutation = useCreateRule();
  const updateMutation = useUpdateRule();
  const deleteMutation = useDeleteRule();

  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [severity, setSeverity] = useState("warning");
  const [cooldown, setCooldown] = useState("300");

  useEffect(() => {
    setName("");
    setKeywords("");
    setSeverity("warning");
    setCooldown("300");
  }, [camera?.id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera) return;
    try {
      await createMutation.mutateAsync({
        cameraId: camera.id,
        name,
        keywords,
        severity,
        cooldown_seconds: Number(cooldown) || 0,
      });
      setName("");
      setKeywords("");
    } catch (err) {
      toast({
        title: "Could not add rule",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={!!camera} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif tracking-editorial">
            Incident rules{camera ? ` — ${camera.name}` : ""}
          </DialogTitle>
          <DialogDescription>
            A rule fires when any keyword appears in the AI frame caption.
            Keywords are comma-separated, e.g. person, car, smoke.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {(rules ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground py-2">
              No rules yet — without one this camera only collects snapshots.
            </p>
          )}
          {(rules ?? []).map((rule: CameraRule) => (
            <div
              key={rule.id}
              className="flex items-center gap-3 border border-border px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{rule.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {rule.keywords.join(", ")} · {rule.severity} · cooldown {rule.cooldown_seconds ?? 0}s
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  camera &&
                  updateMutation.mutate({
                    cameraId: camera.id,
                    ruleId: rule.id,
                    enabled: !rule.enabled,
                  })
                }
              >
                {rule.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-destructive"
                onClick={() =>
                  camera && deleteMutation.mutate({ cameraId: camera.id, ruleId: rule.id })
                }
                aria-label="Delete rule"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              </Button>
            </div>
          ))}
        </div>
        <form onSubmit={handleAdd} className="space-y-3 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rule name"
              className="h-10"
            />
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Keywords, comma separated"
            className="h-10 font-mono text-sm"
          />
          <div className="flex items-center gap-3">
            <Input
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              inputMode="numeric"
              placeholder="Cooldown (sec)"
              className="h-10 w-36"
            />
            <Button type="submit" disabled={createMutation.isPending} className="ml-auto">
              {createMutation.isPending ? "Adding…" : "Add rule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WatchDialog({ camera, onClose }: { camera: Camera | null; onClose: () => void }) {
  // Cache-bust on an interval for a live-ish view.
  const [frameNonce, setFrameNonce] = useState(0);
  useEffect(() => {
    if (!camera) return;
    setFrameNonce((n) => n + 1);
    const timer = setInterval(() => setFrameNonce((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, [camera?.id]);

  return (
    <Dialog open={!!camera} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif tracking-editorial">
            {camera?.name ?? "Live view"}
          </DialogTitle>
          <DialogDescription>
            Latest frame, refreshed every few seconds.
            {camera?.location ? ` · ${camera.location}` : ""}
          </DialogDescription>
        </DialogHeader>
        {camera && (
          <div className="border border-border bg-background">
            {camera.has_snapshot || frameNonce > 0 ? (
              <img
                key={frameNonce}
                src={`/api/cameras/${camera.id}/snapshot?fresh=1&t=${frameNonce}`}
                alt={`Latest frame from ${camera.name}`}
                className="w-full max-h-[60vh] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
