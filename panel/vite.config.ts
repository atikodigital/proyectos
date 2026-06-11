/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "/panel/" → el agente Express sirve el build en /panel
export default defineConfig({
  base: "/panel/",
  plugins: [react()],
  test: { environment: "jsdom" },
});
