import { useMemo } from "react";
import { motion } from "framer-motion";
import { Meeple } from "./meeple";
import { MEEPLE_COLORS } from "../../../shared/meeples";

// A handful of pieces that fly out from the centre and fade. Mount with a new key to replay.
export function Burst({ count = 10 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const distance = 60 + Math.random() * 50;
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance - 30,
          rotate: (Math.random() - 0.5) * 720,
          color: MEEPLE_COLORS[Math.floor(Math.random() * 8)],
          die: i % 4 === 0,
        };
      }),
    [count],
  );

  return (
    <span aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-10">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          initial={{ x: 0, y: 0, scale: 0.3, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: [0, p.y, p.y + 40], scale: 1, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        >
          {p.die ? (
            <span className="block size-3.5 rounded-[3px] border-2 border-ink bg-[#fff6ef]" />
          ) : (
            <Meeple color={p.color} size={16} />
          )}
        </motion.span>
      ))}
    </span>
  );
}
