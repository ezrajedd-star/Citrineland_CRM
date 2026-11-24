/**
 * Single source of truth for Citrineland branding.
 * Tailwind (`tailwind.config.ts`), the PDF generator and emails all read from here.
 */
export const brand = {
  name: "Citrineland",
  productName: "Citrineland CRM",
  tagline: "Homes that shine",
  /** Citrine / amber accent scale */
  colors: {
    50: "#fffbeb",
    100: "#fef3c7",
    200: "#fde68a",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#b45309",
    800: "#92400e",
    900: "#78350f",
  },
  /** Primary accent used for buttons/links */
  primary: "#d97706",
  primaryForeground: "#ffffff",
  /** Neutral text color for documents */
  ink: "#1c1917",
  muted: "#78716c",
} as const;

/** Inventory status colors (stack plan, badges) */
export const inventoryStatusColors: Record<string, { bg: string; text: string; label: string }> = {
  AVAILABLE: { bg: "#dcfce7", text: "#166534", label: "Available" },
  ON_HOLD: { bg: "#fef3c7", text: "#92400e", label: "On hold" },
  RESERVED: { bg: "#dbeafe", text: "#1e40af", label: "Reserved" },
  SOLD: { bg: "#e7e5e4", text: "#44403c", label: "Sold" },
  BLOCKED: { bg: "#fee2e2", text: "#991b1b", label: "Blocked" },
};

/**
 * Chart colors. Categorical slots are the validated default palette (fixed order, never cycled);
 * single-series magnitude charts use the brand accent. Status colors are reserved for state.
 */
export const chartColors = {
  categorical: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  single: brand.colors[600],
  grid: "#e7e5e4",
  axis: "#78716c",
  ink: "#44403c",
};
