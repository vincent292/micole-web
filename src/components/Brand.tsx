import { Link } from "react-router-dom";
export function Brand({
  variant = "horizontal",
  className = "",
  linked = true,
}: {
  variant?: "horizontal" | "symbol" | "white" | "tagline";
  className?: string;
  linked?: boolean;
}) {
  const config = {
    horizontal: {
      src: "logo-horizontal.png",
      box: "48 288 1386 479",
      w: 1448,
      h: 1086,
    },
    symbol: { src: "symbol.png", box: "157 147 940 989", w: 1254, h: 1254 },
    white: { src: "logo-white.png", box: "61 330 1350 482", w: 1448, h: 1086 },
    tagline: {
      src: "logo-tagline.png",
      box: "78 309 1322 507",
      w: 1448,
      h: 1086,
    },
  }[variant];
  const mark = (
    <svg
      className={`micole-logo logo-${variant} ${className}`}
      viewBox={config.box}
      role="img"
      aria-label="MiCole"
    >
      <image href={`/brand/${config.src}`} width={config.w} height={config.h} />
    </svg>
  );
  return linked ? (
    <Link to="/" aria-label="MiCole · Inicio" className="brand-link">
      {mark}
    </Link>
  ) : (
    mark
  );
}
