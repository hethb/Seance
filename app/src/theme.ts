// One spooky-séance palette, shared by every screen. Deep violet-black night,
// candle-amber accents, a ghostly cyan glow. Keep colors here so the four
// screens feel like one app.

export const colors = {
  bg: "#0b0612", // near-black violet — the void
  bgElevated: "#150d22", // cards / sheets
  surface: "#1d1330",
  border: "#2c1f47",

  text: "#f4ecff", // soft moonlight white
  textDim: "#a99fc4", // secondary text
  textFaint: "#6f6690",

  accent: "#e8b84b", // candle amber — primary action / "awaken"
  accentSoft: "#f5d27e",
  spirit: "#7df0e0", // ghostly cyan — "it speaks" / active states
  spiritDim: "#3a8f86",
  danger: "#ff6b8a",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 28,
  pill: 999,
} as const;

export const font = {
  // System fonts only — no asset loading needed for the hackathon build.
  display: { fontSize: 34, fontWeight: "700" as const, color: colors.text },
  title: { fontSize: 24, fontWeight: "700" as const, color: colors.text },
  body: { fontSize: 16, fontWeight: "400" as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: "500" as const, color: colors.textDim },
} as const;
