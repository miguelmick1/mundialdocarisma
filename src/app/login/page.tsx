import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import LoginForm from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth/session";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return <div className="shell"><NavBar /><main className="container"><LoginForm /></main></div>;
}
