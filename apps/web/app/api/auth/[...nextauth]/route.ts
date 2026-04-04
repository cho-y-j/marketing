import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { NextAuthOptions } from "next-auth";

const API_URL = process.env.API_URL || "http://localhost:4002";

export const authOptions: NextAuthOptions = {
  providers: [
    // 네이버 OAuth
    {
      id: "naver",
      name: "Naver",
      type: "oauth",
      authorization: {
        url: "https://nid.naver.com/oauth2.0/authorize",
        params: { response_type: "code" },
      },
      token: "https://nid.naver.com/oauth2.0/token",
      userinfo: "https://openapi.naver.com/v1/nid/me",
      clientId: process.env.NAVER_OAUTH_CLIENT_ID,
      clientSecret: process.env.NAVER_OAUTH_CLIENT_SECRET,
      profile(profile: any) {
        const response = profile.response;
        return {
          id: response.id,
          name: response.name,
          email: response.email,
          image: response.profile_image,
        };
      },
    },
    // 이메일/비밀번호
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });
          const data = await res.json();
          if (res.ok && data.user) {
            return { ...data.user, accessToken: data.token };
          }
          return null;
        } catch {
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.accessToken = (user as any).accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session as any).accessToken = token.accessToken;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
