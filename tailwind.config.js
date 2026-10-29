/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
    "./src/app/**/*.{js,jsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1.25rem",
        sm: "1.5rem",
        lg: "2rem",
      },
      screens: {
        "2xl": "1280px",
      },
    },
    extend: {
      colors: {
        paper: {
          DEFAULT: "var(--color-paper)",
          2: "var(--color-paper-2)",
          3: "var(--color-paper-3)",
        },
        ink: {
          DEFAULT: "var(--color-ink)",
          2: "var(--color-ink-2)",
          muted: "var(--color-muted)",
        },
        rule: {
          DEFAULT: "var(--color-rule)",
          2: "var(--color-rule-2)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          ink: "var(--color-accent-ink)",
          soft: "var(--color-accent-soft)",
          focus: "var(--color-focus)",
        },
        cool: {
          DEFAULT: "var(--color-cool)",
          soft: "var(--color-cool-soft)",
        },
        ok: {
          DEFAULT: "var(--color-ok)",
        },
        bad: {
          DEFAULT: "var(--color-bad)",
        },
        border: "var(--color-rule)",
        input: "var(--color-rule)",
        ring: "var(--color-focus)",
        background: "var(--color-paper)",
        foreground: "var(--color-ink)",
        primary: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-ink)",
        },
        secondary: {
          DEFAULT: "var(--color-paper-2)",
          foreground: "var(--color-ink-2)",
        },
        destructive: {
          DEFAULT: "var(--color-bad)",
          foreground: "var(--color-ink)",
        },
        muted: {
          DEFAULT: "var(--color-paper-3)",
          foreground: "var(--color-muted)",
        },
        card: {
          DEFAULT: "var(--color-paper-2)",
          foreground: "var(--color-ink)",
        },
      },
      borderRadius: {
        card: "var(--radius-card)",
        pill: "var(--radius-pill)",
        lg: "var(--radius-card)",
        md: "calc(var(--radius-card) - 2px)",
        sm: "var(--radius-pill)",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-outlier)"],
      },
    },
  },
  plugins: [],
};
