// 该文件用于「部署时覆盖」构建时变量。常态无须修改。
// 留空字段将回退到 .env.* 与 src/config/admin.ts 的默认。
// 修改后需重新 npm run build，Vite 会把本文件原样拷贝到 dist/config.js。
//
// 优先级：URL ?env=xxx > 本文件 > .env.* > 代码内默认
window.ADMIN_CONFIG = {
  env: "",
  functionName: "",
};
