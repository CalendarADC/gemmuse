import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = new Set(["/", "/login", "/register", "/pending"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname.startsWith("/api/register")) return true;
  return false;
}

function isProtectedPath(pathname: string): boolean {
  if (pathname.startsWith("/create")) return true;
  if (pathname.startsWith("/admin")) return true;
  if (pathname.startsWith("/api/generate-main")) return true;
  if (pathname.startsWith("/api/enhance")) return true;
  if (pathname.startsWith("/api/generate-copy")) return true;
  if (pathname.startsWith("/api/tasks")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!isProtectedPath(pathname) && !isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.AUTH_SECRET });
  const isLoggedIn = !!token?.sub;
  const status = (token?.status as string | undefined) ?? "";
  const role = (token?.role as string | undefined) ?? "";

  if (!isLoggedIn && isProtectedPath(pathname)) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && (pathname === "/" || pathname === "/login" || pathname === "/register")) {
    if (status === "PENDING") return NextResponse.redirect(new URL("/pending", req.url));
    if (status === "ACTIVE") return NextResponse.redirect(new URL("/create/design", req.url));
  }

  if (isLoggedIn && status === "PENDING" && pathname.startsWith("/create")) {
    return NextResponse.redirect(new URL("/pending", req.url));
  }

  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/create/design", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
