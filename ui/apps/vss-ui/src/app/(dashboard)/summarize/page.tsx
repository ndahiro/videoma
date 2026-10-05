"use client";

import { useState, useEffect } from "react";
import {
  useSummarizeVideo,
  useListVideos,
  SummarizeInputStyle,
} from "@/lib/hooks/use-video-api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, Clock, Film, ArrowDownToLine } from "lucide-react";

const styleOptions = [
  { value: SummarizeInputStyle.brief, label: "Brief" },
  { value: SummarizeInputStyle.detailed, label: "Detailed" },
  { value: SummarizeInputStyle.bullet_points, label: "Bullet points" },
];

export default function SummarizePage() {
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [style, setStyle] = useState<string>(SummarizeInputStyle.detailed);
  // Keep polling while any reel is still indexing so the selector
  // activates on its own once embedding completes.
  const { data: videos, isLoading: videosLoading } = useListVideos((query) =>
    query.state.data?.some(
      (v) =>
        (v.embedding_status ?? v.status) === "pending" ||
        (v.embedding_status ?? v.status) === "processing",
    )
      ? 2000
      : false,
  );

  const summarizeMutation = useSummarizeVideo();

  useEffect(() => {
    if (videos && videos.length > 0 && !selectedVideoId) {
      const readyVideo = videos.find((v) => v.embedding_status === "complete");
      if (readyVideo) setSelectedVideoId(readyVideo.id);
    }
  }, [videos, selectedVideoId]);

  const handleSummarize = () => {
    if (!selectedVideoId) return;
    summarizeMutation.mutate({
      video_id: selectedVideoId,
      style,
    });
  };

  const result = summarizeMutation.data;
  const isLoading = summarizeMutation.isPending;
  const error = summarizeMutation.error;
  const readyVideos = videos?.filter((v) => v.embedding_status === "complete") || [];

  return (
    <div>
      <PageHeader
        index="05"
        title="Summarize"
        description="Condense a reel into a brief, a detailed read, or a bullet proof."
        meta="Summarize"
        loading={isLoading}
      />

      <section className="px-8 pt-8">
        <div className="border border-card-border bg-card">
          <div className="grid md:grid-cols-[1fr_180px_auto] divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="p-5 space-y-2">
              <span className="eyebrow flex items-center gap-2">
                <span>01</span>
                <span>Reel</span>
              </span>
              <Select
                value={selectedVideoId}
                onValueChange={setSelectedVideoId}
                disabled={videosLoading}
              >
                <SelectTrigger className="h-11 border-border bg-input">
                  <SelectValue placeholder="Choose a reel to summarize…" />
                </SelectTrigger>
                <SelectContent>
                  {videosLoading ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      Loading…
                    </div>
                  ) : readyVideos.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      No indexed reels available
                    </div>
                  ) : (
                    readyVideos.map((video) => (
                      <SelectItem key={video.id} value={video.id}>
                        <div className="flex items-center gap-2">
                          <Film
                            className="w-3 h-3 text-primary"
                            strokeWidth={1.75}
                          />
                          {video.name}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="p-5 space-y-2">
              <span className="eyebrow flex items-center gap-2">
                <span>02</span>
                <span>Style</span>
              </span>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="h-11 border-border bg-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {styleOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-5 flex items-end">
              <Button
                onClick={handleSummarize}
                disabled={!selectedVideoId || isLoading}
                className="w-full h-11"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Summarizing
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" strokeWidth={1.75} />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Loading */}
      {isLoading && (
        <section className="px-8 mt-8 space-y-3 max-w-3xl">
          <Skeleton className="h-6 w-48 bg-secondary" />
          <Skeleton className="h-48 bg-secondary" />
        </section>
      )}

      {/* Error */}
      {error && !isLoading && (
        <section className="px-8 mt-8 max-w-3xl">
          <div className="border border-err/40 bg-err/10 px-5 py-4">
            <span className="eyebrow text-err">Failed</span>
            <p className="mt-1 text-sm text-err/90">
              {error instanceof Error ? error.message : "Could not generate a summary. Try a different reel or retry."}
            </p>
          </div>
        </section>
      )}

      {/* Result */}
      {result && !isLoading && (
        <section className="px-8 mt-8 pb-10 max-w-3xl">
          <article className="border border-card-border bg-card">
            <header className="px-7 py-5 border-b border-border flex items-center gap-4">
              <span className="timecode text-[11px] text-primary">S/01</span>
              <span className="hr-hairline w-10" />
              <h2 className="font-serif text-lg tracking-editorial flex-1 truncate">
                {result.video_name || "Summary"}
              </h2>
              <div className="flex items-center gap-3 shrink-0">
                <span className="eyebrow">{style.replace("_", " ")}</span>
                {result.elapsed_ms != null && (
                  <span className="flex items-center gap-1 timecode text-[10px] text-muted-foreground">
                    <Clock className="w-3 h-3" strokeWidth={1.75} />
                    {result.elapsed_ms} ms
                  </span>
                )}
              </div>
            </header>
            <div className="px-7 py-7">
              <div className="font-serif text-[17px] leading-[1.7] tracking-editorial text-foreground/95 whitespace-pre-wrap">
                {result.summary}
              </div>
            </div>
            <footer className="px-7 py-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span className="eyebrow">End of summary</span>
              <button className="flex items-center gap-1.5 hover:text-foreground transition-colors timecode uppercase text-[10px]">
                <ArrowDownToLine className="w-3 h-3" strokeWidth={1.75} />
                Export
              </button>
            </footer>
          </article>
        </section>
      )}

      {/* Empty */}
      {!result && !isLoading && !error && (
        <section className="px-8 mt-12 max-w-2xl">
          <div className="border border-dashed border-border px-8 py-14 text-center">
            <span className="eyebrow block mb-3">No summary yet</span>
            <p className="font-serif text-lg tracking-editorial text-foreground/70 italic">
              Pick a processed reel and a style. Videoma will read across its
              keyframes and return a structured summary.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
