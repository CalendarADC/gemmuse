import { redirect } from "next/navigation";

/** 已改为密钥模式，不再开放注册 */
export default function RegisterPage() {
  redirect("/create/design");
}
