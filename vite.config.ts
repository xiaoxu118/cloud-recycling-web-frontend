import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // vendor-cloudbase 单块约 630KB（gzip 156KB），是 SDK 自身体积且登录即需要；
    // vendor-core 聚合 react/router/recharts 等约 780KB，拆开会产生循环 chunk。
    // 两者都无法再拆或延迟加载，因此把警告阈值提到它们之上，避免每次构建都刷无效告警。
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // 按依赖来源分块：让 MUI / 图标 / CloudBase SDK 各自独立，
        // 改业务代码时这些 vendor 块的 hash 不变，用户可以继续命中浏览器缓存。
        // 注意：react / react-router / recharts / d3 / lodash 等互相引用，
        // 拆开会产生 circular chunk（运行时 TDZ 报错、整页白屏），必须留在同一块里。
        manualChunks: (id) => {
          if (id.includes("node_modules/@mui") || id.includes("node_modules/@emotion")) return "vendor-mui";
          if (id.includes("node_modules/lucide-react")) return "vendor-icons";
          if (id.includes("node_modules/@cloudbase") || id.includes("node_modules/core-js-pure")) return "vendor-cloudbase";
          if (id.includes("node_modules")) return "vendor-core";
        },
      },
    },
  },
});
