import React from "react";
import { BookOpen, LoaderCircle } from "lucide-react";

export function BoardElement({ element: e }) {
  const style = {
    left: e.x + "%",
    top: e.y + "%",
    width: e.width + "%",
    height: e.height + "%",
    fontSize: `clamp(18px, ${e.fontSize / 15}vw, ${e.fontSize}px)`,
    "--board-font-size": `${e.fontSize}px`,
    color: e.color,
  };
  return (
    <div
      className={`board-element ${e.type} ${e.highlight ? "highlighted" : ""}`}
      style={style}
      data-element-id={e.id}
    >
      {e.type === "text" ? (
        <>
          <strong>{e.text}</strong>
          {e.translation && <small>{e.translation}</small>}
        </>
      ) : e.type === "shape" ? (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-label={e.text || e.shape}
        >
          <g fill={e.color}>
            {e.shape === "circle" ? (
              <circle cx="50" cy="50" r="44" />
            ) : e.shape === "triangle" ? (
              <path d="M50 5 97 93H3Z" />
            ) : e.shape === "star" ? (
              <path d="m50 3 14 30 33 5-24 23 6 34-29-16-29 16 6-34L3 38l33-5Z" />
            ) : (
              <rect x="7" y="7" width="86" height="86" rx="10" />
            )}
          </g>
        </svg>
      ) : e.src ? (
        <img src={e.src} alt={e.text || "Lernbild"} />
      ) : (
        <div className="image-placeholder">
          {e.imageStatus === "loading" ? (
            <LoaderCircle className="spin" />
          ) : (
            <BookOpen />
          )}
          <span>
            {e.imageStatus === "failed"
              ? "Wir lernen mit Wörtern weiter."
              : e.imageStatus === "loading"
                ? "GPT Image zeichnet dein Bild. Einen Moment, bitte …"
                : e.missingEmoji
                  ? "Kein passendes Emoji. Ein Bild wird für dich gezeichnet …"
                  : e.text || "Ein Bild für dich"}
          </span>
        </div>
      )}
    </div>
  );
}
