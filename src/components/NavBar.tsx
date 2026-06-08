import Link from "next/link";
import { getCurrentUser, isAdminUser } from "@/lib/auth/session";
import LogoutButton from "@/components/LogoutButton";

export default async function NavBar() {
  const user = await getCurrentUser();
  const admin = user ? await isAdminUser(user) : false;

  return <header className="topbar">
    <Link className="brand" href={user ? "/dashboard" : "/"}><span className="brand-mark">⚽</span><span><b>Super Bolão</b><small>Copa 2026</small></span></Link>
    <nav className="navlinks">
      {user ? <>
        <Link href="/palpites">Palpites</Link>
        <Link href="/classificacao">Copa</Link>
        <Link href="/resultados">Resultados</Link>
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
