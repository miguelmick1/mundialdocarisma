"use client";

import { useState } from "react";

function normalizeFlagCode(iso2?: string | null) {
  if (!iso2) return null;
  const normalized = iso2.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(normalized)) return normalized;
  if (["gb-eng", "gb-sct", "gb-wls"].includes(normalized)) return normalized;
  return null;
}

export default function CountryFlag({
  iso2,
  name,
  className = "team-flag-image"
}: {
  iso2?: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const code = normalizeFlagCode(iso2);

  if (!code || failed) {
    return (
      <span className="team-flag-fallback" aria-label={`Bandeira de ${name}`}>
        {iso2?.slice(-2) ?? "--"}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={`https://flagcdn.com/${code}.svg`}
      alt={`Bandeira de ${name}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
