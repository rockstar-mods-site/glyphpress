import { createFileRoute } from "@tanstack/react-router";
import { GlyphpressApp } from "@/components/glyphpress";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <GlyphpressApp />;
}
