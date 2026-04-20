import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare } from "bcryptjs";

import { prisma } from "@/lib/db";
import { getAuthSecret } from "@/lib/authSecret";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: getAuthSecret(),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email + Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });
        if (!user) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        if (user.status === "PENDING") {
          throw new Error("PENDING_APPROVAL");
        }
        if (user.status === "DISABLED") {
          throw new Error("ACCOUNT_DISABLED");
        }
        if (user.status === "REJECTED") {
          throw new Error("ACCOUNT_REJECTED");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = ((user as { role?: "ADMIN" | "USER" }).role ?? "USER") as "ADMIN" | "USER";
        token.status = ((user as { status?: "PENDING" | "ACTIVE" | "DISABLED" | "REJECTED" })
          .status ?? "ACTIVE") as "PENDING" | "ACTIVE" | "DISABLED" | "REJECTED";
      }
      if (token.sub) {
        token.userId = token.sub;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as "ADMIN" | "USER") ?? "USER";
        session.user.status =
          (token.status as "PENDING" | "ACTIVE" | "DISABLED" | "REJECTED") ?? "ACTIVE";
      }
      return session;
    },
  },
};
