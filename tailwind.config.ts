import type { Config } from "tailwindcss";

const config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      canvas: "var(--bg-canvas)",
      surface: "var(--bg-surface)",
      surface2: "var(--bg-surface-2)",
      "surface-2": "var(--bg-surface-2)",
      inset: "var(--bg-inset)",
      ink: {
        primary: "var(--ink-primary)",
        secondary: "var(--ink-secondary)",
        tertiary: "var(--ink-tertiary)",
        muted: "var(--ink-muted)",
      },
      rule: {
        hairline: "var(--rule-hairline)",
        strong: "var(--rule-strong)",
      },
      accent: {
        DEFAULT: "var(--accent-vermillion)",
        vermillion: "var(--accent-vermillion)",
        hover: "var(--accent-vermillion-hover)",
        soft: "var(--accent-vermillion-soft)",
      },
      success: "var(--success-moss)",
      warning: "var(--warning-ochre)",
      danger: "var(--danger-rust)",
      info: "var(--info-ink)",
    },
    borderColor: {
      DEFAULT: "var(--rule-hairline)",
      hairline: "var(--rule-hairline)",
      strong: "var(--rule-strong)",
      accent: "var(--accent-vermillion)",
      rule: {
        hairline: "var(--rule-hairline)",
        strong: "var(--rule-strong)",
      },
    },
    fontFamily: {
      display: "var(--font-display)",
      sans: "var(--font-sans)",
      mono: "var(--font-mono)",
    },
    fontSize: {
      xxs: "var(--text-xxs)",
      xs: "var(--text-xs)",
      sm: "var(--text-sm)",
      base: "var(--text-base)",
      md: "var(--text-md)",
      lg: "var(--text-lg)",
      xl: "var(--text-xl)",
      "2xl": "var(--text-2xl)",
      "3xl": "var(--text-3xl)",
      "4xl": "var(--text-4xl)",
    },
    spacing: {
      px: "var(--space-px)",
      "0.5": "var(--space-0_5)",
      "1": "var(--space-1)",
      "2": "var(--space-2)",
      "3": "var(--space-3)",
      "4": "var(--space-4)",
      "5": "var(--space-5)",
      "6": "var(--space-6)",
      "8": "var(--space-8)",
      "10": "var(--space-10)",
      "12": "var(--space-12)",
      "16": "var(--space-16)",
      "20": "var(--space-20)",
      "24": "var(--space-24)",
    },
    borderRadius: {
      none: "var(--radius-none)",
      sm: "var(--radius-sm)",
      md: "var(--radius-md)",
      lg: "var(--radius-lg)",
    },
    boxShadow: {
      xs: "var(--shadow-xs)",
      md: "var(--shadow-md)",
      lg: "var(--shadow-lg)",
    },
    transitionDuration: {
      instant: "var(--duration-instant)",
      fast: "var(--duration-fast)",
      DEFAULT: "var(--duration-base)",
      slow: "var(--duration-slow)",
      deliberate: "var(--duration-deliberate)",
    },
    transitionTimingFunction: {
      standard: "var(--ease-standard)",
      emphasized: "var(--ease-emphasized)",
      exit: "var(--ease-exit)",
    },
  },
  plugins: [],
} satisfies Config;

export default config;
