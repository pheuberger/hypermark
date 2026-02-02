import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    fs: {
      strict: false
    },
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.beads/**']
    }
  },
  test: {
    // Use jsdom for DOM APIs and React component testing
    environment: "jsdom",

    // Global setup file - runs before each test file
    setupFiles: ["./src/test-utils/setup.js"],

    // Enable global test APIs (describe, it, expect, vi)
    globals: true,

    // Include test files matching these patterns
    include: ["src/**/*.{test,spec}.{js,jsx}"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/",
        "src/test-utils/",
        "**/*.test.{js,jsx}",
        "**/*.spec.{js,jsx}",
        "**/*.config.{js,mjs}",
        "src/main.jsx",
      ],
      // Coverage thresholds
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },

    // Test timeout (10 seconds for async crypto operations)
    testTimeout: 10000,

    // Pool configuration for test isolation
    pool: "forks",

    // Reporter configuration
    reporters: ["default"],

    // Watch mode exclusions
    watchExclude: ["node_modules/", "coverage/", ".vitest/", ".beads/"],
  },
});
