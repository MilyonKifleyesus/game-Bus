import { useEffect } from "react";

let gameLoaded = false;

export default function DriftingGame() {
  useEffect(() => {
    if (gameLoaded) return;
    gameLoaded = true;
    // Dynamic import so the heavy three.js scene only loads client-side.
    // @ts-expect-error - plain JS module, no types
    import("../game-scene.js").catch((e: unknown) => {
      console.error("Failed to load game scene:", e);
    });
  }, []);

  return (
    <>
      <style>{`
        html, body, #app, #game-root { width: 100%; height: 100%; overflow: hidden; background: #000; margin: 0; padding: 0; }
        #game-root canvas { display: block; outline: none !important; }
        #crash-vignette {
          position: fixed; inset: 0; pointer-events: none; z-index: 99; opacity: 0;
          background: radial-gradient(ellipse at center, transparent 45%, rgba(255,20,20,0) 55%, rgba(255,0,0,0.6) 100%);
          mix-blend-mode: screen; transition: opacity 0.05s;
        }
        #chromatic-left, #chromatic-right {
          position: fixed; top: 0; width: 15%; height: 100%;
          pointer-events: none; z-index: 99; opacity: 0; transition: opacity 0.05s;
        }
        #chromatic-left { left: 0; background: linear-gradient(to right, rgba(255,0,50,0.35), transparent); }
        #chromatic-right { right: 0; background: linear-gradient(to left, rgba(0,100,255,0.3), transparent); }
        #points-vignette {
          position: fixed; inset: 0; pointer-events: none; z-index: 98; opacity: 0;
          background: radial-gradient(ellipse at center, transparent 45%, rgba(0,255,80,0) 55%, rgba(0,255,60,0.5) 100%);
          mix-blend-mode: screen; transition: opacity 0.08s;
        }
        #points-chromatic-left, #points-chromatic-right {
          position: fixed; top: 0; width: 12%; height: 100%;
          pointer-events: none; z-index: 98; opacity: 0; transition: opacity 0.08s;
        }
        #points-chromatic-left { left: 0; background: linear-gradient(to right, rgba(0,255,100,0.3), transparent); }
        #points-chromatic-right { right: 0; background: linear-gradient(to left, rgba(100,255,0,0.25), transparent); }
      `}</style>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Lilita+One&family=Fredoka:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      <div id="game-root" style={{ position: "fixed", inset: 0 }} />
      <div id="crash-vignette" />
      <div id="chromatic-left" />
      <div id="chromatic-right" />
      <div id="points-vignette" />
      <div id="points-chromatic-left" />
      <div id="points-chromatic-right" />
    </>
  );
}
