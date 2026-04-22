/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Turbopack 이 생성하는 청크 파일명이 내용 변경에 민감하지 않아 같은 URL 에
  // 다른 내용이 덮이는데, 기본 헤더 Cache-Control: public, max-age=31536000, immutable
  // 때문에 브라우저가 옛 파일을 영영 새로 안 받아옴. 재배포 때마다 새 청크를
  // 확실히 받게 하려고 정적 자산의 immutable 을 취소한다.
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
