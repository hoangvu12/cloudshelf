import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import svgr from "vite-plugin-svgr";
import path from "node:path";

const API_TARGET = process.env.CLOUDSHELF_API ?? "http://localhost:3001";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // Material Symbols SVGs ship without an explicit fill. Setting `fill:
    // currentColor` on the root <svg> means Tailwind `text-*` classes on the
    // wrapper drive icon color, identical to the Lucide ergonomics we're
    // replacing.
    svgr({
      svgrOptions: {
        svgProps: { fill: "currentColor" },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@server": path.resolve(__dirname, "./server"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
});
