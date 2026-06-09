"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareAvatarFile } from "@/lib/client/avatar-image";
import type { AvatarSource } from "@/lib/users/avatar";

interface ProfileFormProps {
  initialName: string;
  email: string | null;
  initialAvatarUrl: string | null;
  googleAvatarUrl: string | null;
  initialAvatarSource: AvatarSource;
}

export default function ProfileForm({
  initialName,
  email,
  initialAvatarUrl,
  googleAvatarUrl,
  initialAvatarSource,
}: ProfileFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [avatarSource, setAvatarSource] = useState<AvatarSource>(initialAvatarSource);
  const [loadingName, setLoadingName] = useState(false);
  const [loadingAvatar, setLoadingAvatar] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const sourceLabel = useMemo(() => {
    if (avatarSource === "CUSTOM") return "Foto personalizada";
    if (avatarSource === "ADMIN") return "Foto definida pela administração";
    if (avatarSource === "GOOGLE") return "Foto da conta Google";
    return "Iniciais do nome";
  }, [avatarSource]);

  async function submitName(event: FormEvent) {
    event.preventDefault();
    setLoadingName(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível salvar.");

      setDisplayName(data.displayName);
      setMessage(data.message ?? "Nome atualizado com sucesso.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setLoadingName(false);
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const original = event.target.files?.[0];
    event.target.value = "";
    if (!original) return;
    setLoadingAvatar(true);
    setMessage("");
    setError("");
    try {
      const prepared = await prepareAvatarFile(original);
      const body = new FormData();
      body.set("file", prepared);
      const response = await fetch("/api/profile/avatar", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível enviar a foto.");
      setAvatarUrl(data.avatarUrl);
      setAvatarSource(data.avatarSource);
      setMessage("Foto atualizada. O recorte quadrado foi aplicado automaticamente.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar a foto.");
    } finally {
      setLoadingAvatar(false);
    }
  }

  async function changeAvatar(action: "USE_GOOGLE" | "REMOVE") {
    setLoadingAvatar(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/profile/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a foto.");
      setAvatarUrl(data.avatarUrl);
      setAvatarSource(data.avatarSource);
      setMessage(action === "USE_GOOGLE" ? "Foto do Google restaurada." : "Foto removida.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível atualizar a foto.");
    } finally {
      setLoadingAvatar(false);
    }
  }

  return <section className="profile-panel profile-panel-v2">
    <div className="profile-avatar-column">
      <div className="profile-avatar profile-avatar-photo" aria-label={`Foto de ${displayName}`}>
        {avatarUrl ? <img src={avatarUrl} alt="" /> : displayName.trim().charAt(0).toUpperCase() || "P"}
      </div>
      <strong>{sourceLabel}</strong>
      <small className="muted">JPG, PNG ou WebP · máximo 5 MB</small>
      <label className={`button button-yellow profile-file-button ${loadingAvatar ? "disabled" : ""}`}>
        {loadingAvatar ? "Preparando…" : "Escolher nova foto"}
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={loadingAvatar} />
      </label>
      <div className="profile-avatar-actions">
        {googleAvatarUrl ? <button type="button" className="button" onClick={() => changeAvatar("USE_GOOGLE")} disabled={loadingAvatar || avatarSource === "GOOGLE"}>Usar foto do Google</button> : null}
        <button type="button" className="button" onClick={() => changeAvatar("REMOVE")} disabled={loadingAvatar || !avatarUrl}>Remover foto</button>
      </div>
    </div>

    <div className="profile-content">
      <div className="eyebrow">Identidade no bolão</div>
      <h2>Meu perfil</h2>
      <p className="muted">Seu nome e sua foto aparecem na classificação, nos confrontos e nas revelações do sorteio.</p>

      <form onSubmit={submitName}>
        <div className="field">
          <label htmlFor="displayName">Nome do participante</label>
          <input
            id="displayName"
            className="input"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            minLength={2}
            maxLength={60}
            autoComplete="name"
            required
          />
        </div>
        <div className="field">
          <label>E-mail da conta</label>
          <input className="input profile-readonly" value={email ?? ""} readOnly />
          <small className="muted">O e-mail é usado somente para login e não será exibido como seu nome.</small>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {message ? <p className="success">{message}</p> : null}
        <button className="button button-primary" type="submit" disabled={loadingName}>
          {loadingName ? "Salvando…" : "Salvar nome"}
        </button>
      </form>
    </div>
  </section>;
}
