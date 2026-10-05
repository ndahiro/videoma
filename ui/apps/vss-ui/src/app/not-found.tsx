import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center gap-3 mb-8">
          <span className="timecode text-[11px] text-primary">404</span>
          <span className="hr-hairline w-12" />
          <span className="eyebrow">Off the reel</span>
        </div>

        <h1 className="font-serif text-[88px] leading-none tracking-editorial text-foreground">
          404
        </h1>
        <p className="font-serif text-2xl tracking-editorial text-foreground/80 mt-4">
          Frame not found.
        </p>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          The page you were looking for doesn&apos;t exist in the index.
        </p>

        <div className="hr-hairline my-8 max-w-xs mx-auto" />

        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Return to console
        </Link>
      </div>
    </div>
  );
}