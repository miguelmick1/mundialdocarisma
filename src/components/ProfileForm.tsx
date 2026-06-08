"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

interface ProfileFormProps {
  initialName: string;
  email: string | null;
}

export default function ProfileForm({ initialName, email }: ProfileFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
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
      setLoading(false);
    }
  }

  return <section className="profile-panel">
    <div className="profile-avatar" aria-hidden="true">
      {displayName.trim().charAt(0).toUpperCase() || "P"}
    </div>
    <div className="profile-content">
      <div className="eyebrow">Identidade no bolão</div>
      <h2>Meu perfil</h2>
      <p className="muted">Este nome aparecerá na mensagem de boas-vindas, nos palpites e no ranking.</p>

      <form onSubmit={submit}>
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
        <button className="button button-primary" type="submit" disabled={loading}>
          {loading ? "Salvando…" : "Salvar nome"}
        </button>
      </form>
    </div>
  </section>;
}
