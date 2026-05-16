import { redirect } from "next/navigation";

/** 已改为密钥模式，不再使用账号登录 */
export default function LoginPage() {
  redirect("/create/design");
}
