/** @type {import('next').NextConfig} */
const nextConfig = {
  // 内网 Dify 实例是 http，开发模式关闭严格 TLS 校验不影响；如需代理可在此加配置
  // 开启 standalone 产出可独立部署包（一键启动包用），无需在展机 npm install
  output: "standalone",
};

export default nextConfig;
