import { useState, type FormEvent } from "react";

import type { AccessProjection, DataSlice } from "./client/workflow.js";

type Member = AccessProjection["members"][number];

export const AccessSurface = ({
  access,
  busy,
  onAdd,
  onSetAccess,
  onRevoke,
}: {
  readonly access: DataSlice<AccessProjection>;
  readonly busy: boolean;
  readonly onAdd: (input: {
    readonly displayName: string;
    readonly role: "admin" | "member" | "guest";
    readonly access: "view" | "edit";
  }) => void;
  readonly onSetAccess: (member: Member, access: "view" | "edit") => void;
  readonly onRevoke: (member: Member) => void;
}) => {
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "guest">("member");
  const [spaceAccess, setSpaceAccess] = useState<"view" | "edit">("edit");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy && displayName.trim()) {
      onAdd({ displayName: displayName.trim(), role, access: spaceAccess });
      setDisplayName("");
    }
  };

  if (access.kind === "unavailable") {
    return (
      <section className="access-surface" aria-labelledby="surface-title">
        <header className="surface-heading">
          <p className="eyebrow">Workspace</p>
          <h1 id="surface-title">Dostęp</h1>
          <p>Nie można teraz odczytać bieżącej polityki dostępu.</p>
        </header>
        <div className="access-unavailable" role="alert">
          <strong>Dostęp jest niedostępny</strong>
          <span>{access.message}</span>
        </div>
      </section>
    );
  }

  const current = access.data;
  return (
    <section className="access-surface" aria-labelledby="surface-title">
      <header className="surface-heading access-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="surface-title">Dostęp</h1>
          <p>
            Rola i zakres Space są niezależne. Zmiany są wersjonowane,
            audytowane i sprawdzane ponownie po pracy offline.
          </p>
        </div>
        <span className="policy-version">
          Polityka v{current.policyVersion}
        </span>
      </header>

      {current.canManage && (
        <form className="access-composer" onSubmit={submit}>
          <div className="access-composer-title">
            <span className="access-avatar" aria-hidden="true">
              +
            </span>
            <div>
              <strong>Dodaj osobę</strong>
              <small>Utwórz trwałą tożsamość i jawny zakres dostępu.</small>
            </div>
          </div>
          <label>
            <span>Nazwa osoby</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="np. Ada Nowak"
              maxLength={120}
              disabled={busy}
              required
            />
          </label>
          <label>
            <span>Rola w workspace</span>
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "admin" | "member" | "guest")
              }
              disabled={busy}
            >
              <option value="member">Członek</option>
              <option value="guest">Gość</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <fieldset>
            <legend>Dostęp w bieżącym Space</legend>
            <label>
              <input
                type="radio"
                name="space-access"
                checked={spaceAccess === "view"}
                onChange={() => setSpaceAccess("view")}
                disabled={busy}
              />
              Tylko odczyt
            </label>
            <label>
              <input
                type="radio"
                name="space-access"
                checked={spaceAccess === "edit"}
                onChange={() => setSpaceAccess("edit")}
                disabled={busy}
              />
              Może edytować
            </label>
          </fieldset>
          <button
            className="primary-button"
            type="submit"
            disabled={busy || !displayName.trim()}
          >
            {busy ? "Zapisuję…" : "Utwórz dostęp"}
          </button>
          <p className="access-boundary-note">
            Dostęp nie obejmuje ukrytych Space. Pełny zakres funkcji nigdy nie
            poszerza zakresu danych.
          </p>
        </form>
      )}

      <div className="member-list" aria-live="polite">
        <div className="member-list-heading">
          <h2>Osoby z dostępem</h2>
          <span>
            {
              current.members.filter((member) => member.status === "active")
                .length
            }{" "}
            aktywne
          </span>
        </div>
        {current.members.map((member) => {
          const grant = member.spaces[0];
          const self = member.principalId === current.currentPrincipalId;
          return (
            <article
              className={`member-row ${member.status === "revoked" ? "revoked" : ""}`}
              key={member.membershipId}
            >
              <span className="access-avatar" aria-hidden="true">
                {member.displayName
                  .split(/\s+/u)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
                  .toLocaleUpperCase()}
              </span>
              <div className="member-identity">
                <strong>
                  {member.displayName}
                  {self ? " · Ty" : ""}
                </strong>
                <span>
                  {member.role === "owner"
                    ? "Właściciel"
                    : member.role === "admin"
                      ? "Administrator"
                      : member.role === "guest"
                        ? "Gość"
                        : "Członek"}
                  {grant
                    ? ` · ${grant.spaceName}`
                    : member.role === "owner"
                      ? " · główny Space"
                      : " · bez aktywnego Space"}
                </span>
              </div>
              <span className={`access-state ${member.status}`}>
                {member.status === "active" ? "Aktywny" : "Cofnięty"}
              </span>
              {current.canManage &&
                !self &&
                member.status === "active" &&
                grant && (
                  <div className="member-actions">
                    <label>
                      <span className="sr-only">
                        Zakres dla {member.displayName}
                      </span>
                      <select
                        value={grant.access}
                        onChange={(event) =>
                          onSetAccess(
                            member,
                            event.target.value as "view" | "edit",
                          )
                        }
                        disabled={busy}
                      >
                        <option value="view">Tylko odczyt</option>
                        <option value="edit">Może edytować</option>
                      </select>
                    </label>
                    <button
                      className="quiet-danger-button"
                      type="button"
                      onClick={() => onRevoke(member)}
                      disabled={busy}
                    >
                      Cofnij dostęp
                    </button>
                  </div>
                )}
            </article>
          );
        })}
      </div>
    </section>
  );
};
