import axios from "axios";

// 브라우저: 현재 호스트의 4000 포트로 API 접근
// 서버(SSR): 환경변수 또는 Docker 내부 주소
const API_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : process.env.API_URL || "http://localhost:4003";

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// JWT 토큰 자동 첨부
apiClient.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// 401 → 로그인 리다이렉트 (로그인/회원가입 페이지에서는 리다이렉트 안 함)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const path = window.location.pathname;
      if (!path.startsWith("/login") && !path.startsWith("/register") && path !== "/") {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
