import type { ReactNode } from "react";
import CreateWorkspaceLayout from "./_components/CreateWorkspaceLayout";

export default async function CreateLayout({ children }: { children: ReactNode }) {
  return <CreateWorkspaceLayout userId="web-local-user">{children}</CreateWorkspaceLayout>;
}