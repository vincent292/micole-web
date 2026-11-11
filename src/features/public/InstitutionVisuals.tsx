import { useEffect, useState } from "react";

export function InstitutionLogo({ name, src }: { name: string; src: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <div className="affiliate-logo">
      {src && !broken ? (
        <img
          loading="lazy"
          decoding="async"
          src={src}
          alt={`Logo de ${name}`}
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-label={name}>
          {name
            .split(/\s+/)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")
            .toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function InstitutionCover({
  src,
  className = "",
  priority = false,
}: {
  src: string;
  className?: string;
  priority?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  return (
    <div
      className={`institution-cover ${className}${src && !broken ? " has-image" : ""}`}
      aria-hidden="true"
    >
      {src && !broken && (
        <img
          src={src}
          alt=""
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          onError={() => setBroken(true)}
        />
      )}
      <span className="institution-cover-orbit" />
      <span className="institution-cover-dot" />
    </div>
  );
}
