import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Shared SVG filters. Render once, near the root.
// paper-edge: the rough edge on every .paper surface.
// wood: grain plus a bevel highlight for wooden pieces. Its numbers assume a ~100-unit viewBox.
export function PaperDefs() {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <filter id="paper-edge" x="-10%" y="-10%" width="120%" height="135%">
        <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="1" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="wood" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
        {/* Long vertical streaks: high frequency across, low frequency down. */}
        <feTurbulence type="fractalNoise" baseFrequency="0.09 0.008" numOctaves="3" seed="11" result="noise" />
        <feColorMatrix
          in="noise"
          type="matrix"
          values="0 0 0 0 0.22  0 0 0 0 0.13  0 0 0 0 0.06  2.4 0 0 0 -1.05"
          result="grain"
        />
        <feComposite in="grain" in2="SourceGraphic" operator="in" result="grain-in" />
        <feBlend in="grain-in" in2="SourceGraphic" mode="multiply" result="wood" />
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur" />
        <feSpecularLighting in="blur" surfaceScale="3" specularConstant="0.55" specularExponent="14" lightingColor="#fff4e6" result="spec">
          <feDistantLight azimuth="235" elevation="48" />
        </feSpecularLighting>
        <feComposite in="spec" in2="SourceAlpha" operator="in" result="shine" />
        <feComposite in="wood" in2="shine" operator="arithmetic" k1="0" k2="1" k3="0.45" k4="0" />
      </filter>
    </svg>
  );
}

// A game table: a cut-paper top laid on a slightly larger rim, like the stacked layers in the reference.
export function TableDisc({ size, children, className }: { size: number; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full border-2 border-ink"
        style={{ background: "var(--grain), var(--table-rim)", filter: "url(#paper-edge)", boxShadow: "var(--paper-shadow)" }}
      />
      <div
        className="absolute rounded-full border-2 border-ink"
        style={{
          inset: Math.round(size * 0.08),
          background: "var(--grain), var(--table-top)",
          filter: "url(#paper-edge)",
          boxShadow: "0 6px 10px -2px rgb(var(--shadow-color) / 0.55)",
        }}
      />
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}
