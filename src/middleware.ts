import { NextResponse, type NextRequest } from "next/server";
import { isDesktopLocalServerMode } from "@/lib/runtime/desktopLocalMode";

export async function middleware(req: NextRequest) {
  if (isDesktopLocalServerMode(req)) {
    return NextResponse.next();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};