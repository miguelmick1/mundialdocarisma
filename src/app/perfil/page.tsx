import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import ProfileForm from "@/components/ProfileForm";
import { getCurrentUserProfile } from "@/lib/auth/session";

export default async function ProfilePage() {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/login");

  return <div className="shell">
    <NavBar />
    <main className="container profile-page">
      <ProfileForm initialName={profile.displayName} email={profile.email} />
    </main>
  </div>;
}
