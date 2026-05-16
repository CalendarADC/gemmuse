import { redirect } from "next/navigation";

/** 审核等待页已停用 */
export default function PendingPage() {
  redirect("/create/design");
}
