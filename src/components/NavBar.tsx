import Link from "next/link";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import LogoutButton from "@/components/LogoutButton";

async function getLiveCount() {
  try {
    const snap = await adminDb.collection("matches").where("status", "in", ["LIVE", "HALFTIME", "EXTRA_TIME"]).get();
    return snap.size;
  } catch {
    return 0;
  }
}

export default async function NavBar() {
  const user = await getCurrentUser();
  const [admin, liveCount] = user ? await Promise.all([isAdminUser(user), getLiveCount()]) : [false, 0];

  return <header className="topbar">
    <Link className="brand" href={user ? "/dashboard" : "/"}><span className="brand-mark">⚽</span><span><b>Super Bolão</b><small>Copa 2026</small></span></Link>
    <nav className="navlinks">
      {user ? <>
        <Link href="/palpites">Palpites</Link>
        <Link href="/classificacao">Copa</Link>
        <Link href="/resultados" className={liveCount ? "nav-live-link" : undefined}>Resultados{liveCount ? <span className="nav-live-badge">● {liveCount}</span> : null}</Link>
        <Link href="/ranking">Ranking</Link>
        <Link href="/bots">Bots</Link>
        <Link href="/regulamento">Regulamento</Link>
        <Link href="/perfil">Meu perfil</Link>
        {admin ? <Link className="admin-nav-link" href="/admin">Admin</Link> : null}
        <LogoutButton />
      </> : <><Link href="/regulamento">Regulamento</Link><Link href="/login">Entrar</Link></>}
    </nav>
  </header>;
}
