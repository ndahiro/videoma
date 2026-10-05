"use client";

import { useState, useEffect } from "react";
import { useListVideos, useQueryVideos, type Video } from "@/lib/hooks/use-video-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { Send, Loader2, Bot, ExternalLink, ArrowUp, Film } from "lucide-react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function QueryPage() {
  const [question, setQuestion] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  // Keep polling while any reel is still indexing so the input activates
  // on its own once embedding completes.
  const { data: videos, isLoading: videosLoading } = useListVideos((query) =>
    query.state.data?.some(
      (v) =>
        (v.embedding_status ?? v.status) === "pending" ||
        (v.embedding_status ?? v.status) === "processing",
    )
      ? 2000
      : false,
  );

  const queryMutation = useQueryVideos();

  useEffect(() => {
    if (videos && videos.length > 0 && !selectedVideo) {
      const readyVideo = videos.find((v) => v.embedding_status === "complete");
      if (readyVideo) {
        setSelectedVideo(readyVideo.id);
      } else {
        setSelectedVideo(videos[0].id);
      }
    }
  }, [videos, selectedVideo]);

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !selectedVideo) return;
    queryMutation.mutate({
      video_id: selectedVideo,
      question: question.trim(),
    });
  };

  const result = queryMutation.data;
  const isLoading = queryMutation.isPending;
  const error = queryMutation.error;

  const selectedVideoData = videos?.find((v) => v.id === selectedVideo);
  const isReady = selectedVideoData?.embedding_status === "complete";

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        index="04"
        title="Q & A"
        description="Ask anything about a specific reel. The model reads its frames and answers with citations."
        meta="Query"
        loading={isLoading}
      />

      {/* Video selector */}
      <section className="px-8 pt-6 pb-4 border-b border-border">
        <label className="eyebrow block mb-2">Select reel</label>
        {videosLoading ? (
          <Skeleton className="h-12 w-80 bg-secondary" />
        ) : (
          <select
            value={selectedVideo}
            onChange={(e) => setSelectedVideo(e.target.value)}
            className="w-full max-w-md px-3 py-2 bg-background border border-border text-foreground font-mono text-sm focus:outline-none focus:border-primary"
          >
            {videos?.length === 0 && (
              <option value="" disabled>
                No videos uploaded
              </option>
            )}
            {videos?.map((video) => (
              <option key={video.id} value={video.id}>
                {video.name} — {video.embedding_status === "complete" ? "Indexed" : video.embedding_status}
              </option>
            ))}
          </select>
        )}
        {!isReady && selectedVideo && (
          <p className="mt-2 text-xs text-muted-foreground">
            This reel needs to be indexed before Q&amp;A is available.
          </p>
        )}
      </section>

      <section className="flex-1 overflow-y-auto px-8 py-8">
        {/* Input */}
        <form onSubmit={handleAsk} className="flex gap-3 items-stretch max-w-3xl">
          <Input
            placeholder="Ask about this reel…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="h-12 text-base font-mono pr-4"
            disabled={isLoading || !isReady}
          />
          <Button type="submit" disabled={!question.trim() || isLoading || !isReady} className="h-12 px-6 group">
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Asking
              </>
            ) : (
              <>
                Ask
                <ArrowUp className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" strokeWidth={2.25} />
              </>
            )}
          </Button>
        </form>

        {error && (
          <div className="mt-6 p-4 border border-destructive/30 bg-destructive/5 text-destructive text-sm">
            {error instanceof Error ? error.message : "Something went wrong"}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="mt-10 space-y-4 max-w-3xl">
            <Skeleton className="h-24 bg-secondary" />
            <Skeleton className="h-32 bg-secondary" />
          </div>
        )}

        {/* Result transcript */}
        {result && !isLoading && (
          <article className="mt-10 max-w-3xl space-y-8">
            {/* Question */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="timecode text-[11px] text-primary">Q</span>
                <span className="hr-hairline w-10" />
                <span className="eyebrow">You asked</span>
                {result.elapsed_ms != null && (
                  <span className="ml-auto timecode text-[10px] text-muted-foreground">
                    {result.elapsed_ms} ms
                  </span>
                )}
              </div>
              <p className="font-serif text-2xl tracking-editorial text-foreground leading-snug pl-7">
                {result.question}
              </p>
            </div>

            <div className="hr-hairline" />

            {/* Answer */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="timecode text-[11px] text-primary">A</span>
                <span className="hr-hairline w-10" />
                <span className="eyebrow">Videoma</span>
                <div className="ml-auto flex items-center gap-1.5 text-[10px] timecode text-muted-foreground uppercase tracking-[0.14em]">
                  <Bot className="w-3 h-3" strokeWidth={1.75} />
                  HF VLM
                </div>
              </div>
              <div className="pl-7">
                <div className="font-serif text-lg leading-[1.65] tracking-editorial text-foreground/95 whitespace-pre-wrap">
                  {result.answer}
                </div>
              </div>
            </div>

            {/* Sources */}
            {result.sources && result.sources.length > 0 && (
              <div className="mt-10">
                <div className="flex items-center gap-3 mb-4">
                  <ExternalLink className="w-3 h-3 text-primary" strokeWidth={1.75} />
                  <span className="eyebrow">Sources · {result.sources.length}</span>
                  <span className="hr-hairline flex-1" />
                </div>
                <ol className="space-y-2">
                  {result.sources.map((source, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-4 border border-card-border bg-card px-4 py-3 hover:border-primary/50 transition-colors"
                    >
                      <span className="timecode text-[11px] text-primary w-6 shrink-0">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 min-w-0 text-sm truncate text-foreground">
                        {source.video_name}
                      </span>
                      <span className="timecode text-[10px] text-muted-foreground shrink-0">
                        {(source.score * 100).toFixed(0)}%
                      </span>
                      {source.timestamp_start != null && (
                        <span className="timecode text-[10px] text-primary shrink-0">
                          {formatTime(source.timestamp_start)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </article>
        )}

        {/* Initial empty state */}
        {!result && !isLoading && (
          <div className="mt-16 max-w-2xl">
            <div className="hr-hairline mb-6" />
            <p className="font-serif text-2xl leading-snug tracking-editorial text-foreground/80 italic">
              &ldquo;Ask anything. Videoma reads across your reels, cites its sources, and shows you exactly where to look.&rdquo;
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[
                "What is happening in this video?",
                "When does the person appear?",
                "Describe the main objects",
                "What actions are visible?",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setQuestion(s)}
                  disabled={!isReady}
                  className="text-xs px-3 py-1.5 border border-border hover:border-primary/50 hover:text-primary transition-colors text-muted-foreground disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
