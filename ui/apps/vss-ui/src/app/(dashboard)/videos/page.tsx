"use client";

import { useState, type ReactNode } from "react";
import {
  useListVideos,
  useDeleteVideo,
  useProcessVideo,
  useUploadVideo,
  type Video,
} from "@/lib/hooks/use-video-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/layout/page-header";
import {
  Film,
  Upload,
  Trash2,
  Play,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const statusMeta: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  ready: { label: "Ready", variant: "default" },
  complete: { label: "Ready", variant: "default" },
  processing: { label: "Processing", variant: "secondary" },
  pending: { label: "Pending", variant: "outline" },
  queued: { label: "Queued", variant: "outline" },
  error: { label: "Error", variant: "destructive" },
};

/** Whether a video still needs embedding work (drives list polling). */
function isActiveVideo(video: Video): boolean {
  const status = video.embedding_status ?? video.status;
  return status === "pending" || status === "processing";
}

export default function VideosPage() {
  // Poll every 2s while any video is queued/processing so the progress bar
  // advances live; stop polling once everything settles.
  const { data: videos, isLoading, refetch: refetchVideos } = useListVideos(
    (query) => (query.state.data?.some(isActiveVideo) ? 2000 : false),
  );
  const { toast } = useToast();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const uploadMutation = useUploadVideo({
    onSuccess: (data) => {
      toast({
        title: "Upload accepted",
        description: `${data.uploaded} file${data.uploaded === 1 ? "" : "s"} queued for indexing.`,
      });
    },
  });

  const deleteMutation = useDeleteVideo({
    onSuccess: () => {
      toast({
        title: "Video deleted",
        description: "The reel has been removed.",
      });
      setDeleteId(null);
    },
  });

  const processMutation = useProcessVideo({
    onSuccess: () => {
      toast({
        title: "Processing started",
        description: "Embedding generation has been queued.",
      });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []) as File[];
    if (!fileList.length) return;

    try {
      await uploadMutation.mutateAsync(fileList);
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      e.target.value = "";
    }
  };

  const skeletonRows = Array.from({ length: 5 }, (_, index) => ({
    id: `skeleton-${index}`,
  }));

  let libraryContent: ReactNode;

  if (isLoading) {
    libraryContent = (
      <div className="p-6 space-y-2">
        {skeletonRows.map(({ id }) => (
          <Skeleton key={id} className="h-12 bg-secondary" />
        ))}
      </div>
    );
  } else if (!videos || videos.length === 0) {
    libraryContent = (
      <div className="px-6 py-16 text-center">
        <div className="inline-flex w-10 h-10 items-center justify-center border border-border mb-4">
          <Film
            className="w-4 h-4 text-muted-foreground"
            strokeWidth={1.5}
          />
        </div>
        <h3 className="font-serif text-lg tracking-editorial">
          Library is empty
        </h3>
        <p className="mt-2 text-xs text-muted-foreground">
          Upload a video to start indexing.
        </p>
      </div>
    );
  } else {
    libraryContent = (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-6 py-3 text-left eyebrow">Reel</th>
              <th className="px-6 py-3 text-left eyebrow">Status</th>
              <th className="px-6 py-3 text-left eyebrow">Runtime</th>
              <th className="px-6 py-3 text-left eyebrow">Size</th>
              <th className="px-6 py-3 text-left eyebrow">Created</th>
              <th className="px-6 py-3 text-right eyebrow">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {videos.map((video, index) => {
              const meta =
                statusMeta[video.embedding_status ?? video.status] ||
                statusMeta["pending"];

              return (
                <tr
                  key={video.id}
                  className="hover:bg-secondary/40 transition-colors"
                >
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="timecode text-[10px] text-muted-foreground w-6 shrink-0">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="w-8 h-5 border border-border bg-background shrink-0 relative">
                        <div className="absolute inset-y-0 left-0 w-1.5 bg-muted" />
                        <div className="absolute inset-y-0 right-0 w-1.5 bg-muted" />
                      </div>
                      <span className="truncate text-foreground">{video.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      {(video.embedding_status === "processing" ||
                        video.embedding_status === "pending") && (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={video.progress ?? 0}
                            className="w-20 h-1"
                          />
                          <span className="timecode text-[10px] text-muted-foreground whitespace-nowrap">
                            {video.embedding_status === "processing" &&
                            (video.total_chunks ?? 0) > 0
                              ? `${video.progress ?? 0}% · ${video.chunks_processed ?? 0}/${video.total_chunks}`
                              : video.embedding_status === "processing"
                                ? "Starting…"
                                : "Queued"}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3.5 timecode text-muted-foreground">
                    {video.duration_seconds
                      ? `${Math.round(video.duration_seconds / 60)}m ${Math.round(video.duration_seconds % 60)}s`
                      : "—"}
                  </td>
                  <td className="px-6 py-3.5 timecode text-muted-foreground">
                    {video.size_bytes
                      ? `${(video.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                      : "—"}
                  </td>
                  <td className="px-6 py-3.5 timecode text-muted-foreground text-xs">
                    {new Date(video.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex justify-end gap-1">
                      {video.embedding_status !== "complete" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            processMutation.mutate(video.id)
                          }
                          aria-label="Process reel"
                        >
                          <Play
                            className="w-3.5 h-3.5"
                            strokeWidth={1.75}
                          />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:text-destructive"
                        onClick={() => setDeleteId(video.id)}
                        aria-label="Delete reel"
                      >
                        <Trash2
                          className="w-3.5 h-3.5"
                          strokeWidth={1.75}
                        />
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
        index="02"
        title="Reel library"
        description="Every reel indexed and ready for retrieval. Upload or remove below."
        meta="Library"
        loading={isLoading}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => refetchVideos()}
              className="gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
              Refresh
            </Button>
            <label>
              <Button asChild className="cursor-pointer gap-2">
                <span>
                  <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />
                  Upload
                  <input
                    type="file"
                    multiple
                    accept="video/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </span>
              </Button>
            </label>
          </>
        }
      />

      {/* Library table */}
      <section className="px-8 pt-8 pb-10">
        <Card>
          <div className="px-6 pt-5 pb-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Film className="w-3.5 h-3.5 text-primary" strokeWidth={1.75} />
              <h2 className="font-serif text-base tracking-editorial">
                All reels
              </h2>
            </div>
            <span className="timecode text-[11px] text-muted-foreground uppercase">
              {videos?.length ?? 0} entries
            </span>
          </div>
          <CardContent className="pt-0 px-0">{libraryContent}</CardContent>
        </Card>
      </section>

      <Dialog
        open={!!deleteId}
        onOpenChange={(open: boolean) => !open && setDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif tracking-editorial">
              Remove reel
            </DialogTitle>
            <DialogDescription>
              This reel and its embeddings will be removed from the index. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                deleteId && deleteMutation.mutate(deleteId)
              }
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
