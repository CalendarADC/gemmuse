import type { ReactNode } from "react";
import CreateWorkspaceLayout from "./_components/CreateWorkspaceLayout";

import { requireActiveUser } from "@/lib/auth";

export default async function CreateLayout({ children }: { children: ReactNode }) {
  await requireActiveUser();
  return <CreateWorkspaceLayout>{children}</CreateWorkspaceLayout>;
}
