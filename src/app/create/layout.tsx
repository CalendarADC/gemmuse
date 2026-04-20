import type { ReactNode } from "react";
import CreateWorkspaceLayout from "./_components/CreateWorkspaceLayout";

import { requireActiveUser } from "@/lib/auth";

export default async function CreateLayout({ children }: { children: ReactNode }) {
  const user = await requireActiveUser();
  return <CreateWorkspaceLayout userId={user.id}>{children}</CreateWorkspaceLayout>;
}
