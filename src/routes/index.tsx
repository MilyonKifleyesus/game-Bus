import { createFileRoute } from "@tanstack/react-router";
import DriftingGame from "@/components/DriftingGame";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "3D Drifting Game" },
      { name: "description", content: "Toon-shaded 3D city drifting racer built with Three.js." },
    ],
  }),
  component: Index,
});

function Index() {
  return <DriftingGame />;
}
