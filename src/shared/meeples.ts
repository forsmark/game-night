// Player colours. The server stores the key, the frontend draws the hex.
export const MEEPLES = {
  red: "#D9483B",
  blue: "#2F6FDB",
  yellow: "#F2B732",
  green: "#3E9B5A",
  purple: "#7A4FC9",
  orange: "#EE7D2B",
  pink: "#E05A9C",
  teal: "#1F9AA6",
  black: "#2B2B2E",
  white: "#F4F4F0",
  brown: "#8A5A3B",
  grey: "#8C949A",
} as const;

export type MeepleColor = keyof typeof MEEPLES;
export const MEEPLE_COLORS = Object.keys(MEEPLES) as MeepleColor[];
