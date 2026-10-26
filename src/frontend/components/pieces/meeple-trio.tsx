import { motion } from "framer-motion";
import { Meeple } from "./meeple";
import type { MeepleColor } from "../../../shared/meeples";

const TRIO: { color: MeepleColor; size: number }[] = [
  { color: "red", size: 48 },
  { color: "yellow", size: 56 },
  { color: "blue", size: 48 },
];

// Three meeples that take turns hopping, like players waiting for the game to start.
export function MeepleTrio() {
  return (
    <div className="flex items-end -space-x-3">
      {TRIO.map((m, i) => (
        <motion.div
          key={m.color}
          animate={{ y: [0, -16, 0, 0], rotate: [0, i === 1 ? 0 : i === 0 ? -12 : 12, 0, 0] }}
          transition={{ duration: 1.8, times: [0, 0.18, 0.36, 1], repeat: Infinity, delay: i * 0.3 }}
          whileHover={{ scale: 1.15, rotate: 360, transition: { duration: 0.5 } }}
        >
          <Meeple color={m.color} size={m.size} />
        </motion.div>
      ))}
    </div>
  );
}
