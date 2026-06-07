"use client";

import { useRouter } from "next/navigation";
import { firebaseAuth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    await signOut(firebaseAuth).catch(() => undefined);
    router.push("/login");
    router.refresh();
  }
  return <button onClick={logout}>Sair</button>;
}
