import NextAuthModule from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";

// CommonJS / ESM export resolution for NextAuth across Node and Webpack
const NextAuth =
  typeof NextAuthModule === "function"
    ? NextAuthModule
    : typeof NextAuthModule?.default === "function"
    ? NextAuthModule.default
    : NextAuthModule?.default?.default || NextAuthModule;

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
