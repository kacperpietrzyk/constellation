import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import type {
  AccessProjection,
  AgentAccessProjection,
  DataSlice,
} from "./client/workflow.js";
import type { SpaceId } from "@constellation/contracts";

import { Icon } from "./components/Icon.js";
import { reportFirstEmptyRequiredField } from "./components/InlinePopover.js";

type Member = AccessProjection["members"][number];
type AgentGrant = AgentAccessProjection["grants"][number];

const AccessCreateDialog = ({
  title,
  description,
  open,
  onClose,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog !== null && !dialog.open) {
      dialog.showModal();
      dialog
        .querySelector<HTMLElement>(
          "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
        )
        ?.focus();
    }
  }, [open]);

  const close = () => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="concept-help-backdrop access-dialog-backdrop"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <section className="concept-help-dialog access-dialog">
        <header>
          <div>
            <p className="eyebrow">Nowy dostęp</p>
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={`Zamknij: ${title}`}
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="access-dialog-content">{children}</div>
      </section>
    </dialog>
  );
};

export const AccessSurface = ({
  access,
  agentAccess,
  spaces,
  agentTransport,
  busy,
  onAdd,
  onSetAccess,
  onRevoke,
  onAgentAdd,
  onAgentRotate,
  onAgentRevoke,
}: {
  readonly access: DataSlice<AccessProjection>;
  readonly agentAccess: DataSlice<AgentAccessProjection>;
  readonly spaces: readonly { readonly id: SpaceId; readonly name: string }[];
  readonly agentTransport: "local" | "remote_hub";
  readonly busy: boolean;
  readonly onAdd: (input: {
    readonly displayName: string;
    readonly role: "admin" | "member" | "guest";
    readonly access: "view" | "comment" | "edit";
  }) => void;
  readonly onSetAccess: (
    member: Member,
    access: "view" | "comment" | "edit",
  ) => void;
  readonly onRevoke: (member: Member) => void;
  readonly onAgentAdd: (input: {
    readonly displayName: string;
    readonly preset: "observe" | "propose" | "operate" | "full_access";
    readonly spaceIds: readonly SpaceId[];
    readonly expiresAt?: string;
    readonly federationScope: {
      readonly crossWorkspaceRead: boolean;
      readonly derivedResultWrite: boolean;
      readonly sourceMaterialization: boolean;
    };
  }) => void;
  readonly onAgentRotate: (grant: AgentGrant) => void;
  readonly onAgentRevoke: (grant: AgentGrant) => void;
}) => {
  // One armed destructive/irreversible action at a time: member revoke,
  // agent revoke, or agent credential rotation.
  const [confirmAction, setConfirmAction] = useState<string>();
  const [openCreation, setOpenCreation] = useState<"person" | "agent">();
  const personTriggerRef = useRef<HTMLButtonElement>(null);
  const agentTriggerRef = useRef<HTMLButtonElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "guest">("member");
  const [spaceAccess, setSpaceAccess] = useState<"view" | "comment" | "edit">(
    "edit",
  );
  const [agentName, setAgentName] = useState("");
  const [agentPreset, setAgentPreset] = useState<
    "observe" | "propose" | "operate" | "full_access"
  >("operate");
  const [agentSpaces, setAgentSpaces] = useState<readonly SpaceId[]>(() =>
    spaces[0] === undefined ? [] : [spaces[0].id],
  );
  const [agentExpiry, setAgentExpiry] = useState<"30_days" | "never">(
    "30_days",
  );
  const [federationScope, setFederationScope] = useState({
    crossWorkspaceRead: false,
    derivedResultWrite: false,
    sourceMaterialization: false,
  });
  // The empty-scope alert appears only after the user touched the scope
  // fieldset or tried to submit — not on first render.
  const [spacesTouched, setSpacesTouched] = useState(false);
  const showSpacesError =
    spacesTouched && spaces.length > 0 && agentSpaces.length === 0;
  const closeCreation = () => {
    const closing = openCreation;
    setOpenCreation(undefined);
    requestAnimationFrame(() => {
      (closing === "person"
        ? personTriggerRef.current
        : agentTriggerRef.current
      )?.focus();
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!displayName.trim()) {
      reportFirstEmptyRequiredField(event.currentTarget);
      return;
    }
    onAdd({ displayName: displayName.trim(), role, access: spaceAccess });
    setDisplayName("");
    closeCreation();
  };
  const submitAgent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (agentSpaces.length === 0) setSpacesTouched(true);
    if (busy) return;
    if (!agentName.trim()) {
      reportFirstEmptyRequiredField(event.currentTarget);
      return;
    }
    if (agentSpaces.length === 0) {
      const firstSpace = event.currentTarget.querySelector<HTMLInputElement>(
        ".agent-space-scope input",
      );
      requestAnimationFrame(() => firstSpace?.focus());
      return;
    }
    const expiresAt =
      agentExpiry === "never"
        ? undefined
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    onAgentAdd({
      displayName: agentName.trim(),
      preset: agentPreset,
      spaceIds: agentSpaces,
      federationScope,
      ...(expiresAt === undefined ? {} : { expiresAt }),
    });
    setAgentName("");
    setSpacesTouched(false);
    closeCreation();
  };

  if (access.kind === "unavailable") {
    return (
      <section className="access-surface" aria-labelledby="surface-title">
        <header className="surface-header access-heading">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1 id="surface-title" tabIndex={-1}>
              Dostęp
            </h1>
            <p>Nie można teraz odczytać bieżącej polityki dostępu.</p>
          </div>
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
      <header className="surface-header access-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1 id="surface-title" tabIndex={-1}>
            Dostęp
          </h1>
          <p>Sprawdź, kto może pracować w tym workspace i w jakim zakresie.</p>
        </div>
        <span className="policy-version">
          Polityka v{current.policyVersion}
        </span>
      </header>

      <section className="access-ledger" aria-labelledby="member-list-title">
        <header className="access-ledger-heading">
          <div>
            <h2 id="member-list-title">Osoby</h2>
            <p>Rola w workspace i dostęp do Space pozostają niezależne.</p>
          </div>
          <div className="access-ledger-actions">
            <span className="access-ledger-count">
              {
                current.members.filter((member) => member.status === "active")
                  .length
              }{" "}
              aktywne
            </span>
            {current.canManage && (
              <button
                ref={personTriggerRef}
                type="button"
                className="secondary-button access-create-trigger"
                aria-haspopup="dialog"
                onClick={() => setOpenCreation("person")}
              >
                <Icon name="access" />
                Dodaj osobę
              </button>
            )}
          </div>
        </header>
        <div className="member-list" aria-live="polite">
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
                {current.canManage && !self && member.status === "active" && (
                  <div className="member-actions">
                    {grant && (
                      <label>
                        <span className="sr-only">
                          Zakres dla {member.displayName}
                        </span>
                        <select
                          value={grant.access}
                          onChange={(event) =>
                            onSetAccess(
                              member,
                              event.target.value as "view" | "comment" | "edit",
                            )
                          }
                          disabled={busy}
                        >
                          <option value="view">Tylko odczyt</option>
                          <option value="comment">Może komentować</option>
                          <option value="edit">Może edytować</option>
                        </select>
                      </label>
                    )}
                    {confirmAction === `member-${member.membershipId}` ? (
                      <>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setConfirmAction(undefined)}
                          disabled={busy}
                        >
                          Anuluj
                        </button>
                        <button
                          className="quiet-danger-button"
                          type="button"
                          onClick={() => {
                            setConfirmAction(undefined);
                            onRevoke(member);
                          }}
                          disabled={busy}
                        >
                          Potwierdź cofnięcie
                        </button>
                      </>
                    ) : (
                      <button
                        className="quiet-danger-button"
                        type="button"
                        onClick={() =>
                          setConfirmAction(`member-${member.membershipId}`)
                        }
                        disabled={busy}
                      >
                        Cofnij dostęp
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {current.canManage && openCreation === "person" && (
        <AccessCreateDialog
          title="Dodaj osobę"
          description="Utwórz trwałą tożsamość, a rolę w workspace i dostęp do bieżącego Space przyznaj osobno."
          open
          onClose={closeCreation}
        >
          <form className="access-composer" onSubmit={submit}>
            <label>
              <span>Nazwa osoby</span>
              <input
                name="display-name"
                autoComplete="name"
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
                  checked={spaceAccess === "comment"}
                  onChange={() => setSpaceAccess("comment")}
                  disabled={busy}
                />
                Może komentować
              </label>
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
            <p className="access-boundary-note">
              Dostęp nie obejmuje ukrytych Space. Pełny zakres funkcji nigdy nie
              poszerza zakresu danych.
            </p>
            <div className="access-dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={closeCreation}
                disabled={busy}
              >
                Anuluj
              </button>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Zapisuję…" : "Utwórz dostęp"}
              </button>
            </div>
          </form>
        </AccessCreateDialog>
      )}

      <section
        className="access-ledger agent-access-section"
        aria-labelledby="agent-access-title"
      >
        <header className="agent-access-heading">
          <div>
            <p className="eyebrow">
              MCP ·{" "}
              {agentTransport === "remote_hub"
                ? "zdalnie przez Hub"
                : "lokalnie"}
            </p>
            <h2 id="agent-access-title">Agenci zewnętrzni</h2>
            <p>
              Możliwości i dane to dwie osobne granice. Pełny dostęp działa
              tylko w wybranych Space i nadal wymaga wersji, audytu oraz
              bezpiecznego cofnięcia.
            </p>
          </div>
          {agentAccess.kind === "ready" && (
            <div className="access-ledger-actions">
              <span className="access-ledger-count">
                {
                  agentAccess.data.grants.filter(
                    (grant) => grant.status === "active",
                  ).length
                }{" "}
                aktywne
              </span>
              {agentAccess.data.canManage && (
                <button
                  ref={agentTriggerRef}
                  type="button"
                  className="secondary-button access-create-trigger"
                  aria-haspopup="dialog"
                  onClick={() => setOpenCreation("agent")}
                >
                  <span className="agent-orbit-mark" aria-hidden="true" />
                  Dodaj agenta
                </button>
              )}
            </div>
          )}
        </header>

        {agentAccess.kind === "unavailable" ? (
          <div className="access-unavailable" role="alert">
            <strong>
              {agentTransport === "remote_hub"
                ? "Zdalny MCP jest niedostępny"
                : "Lokalny MCP jest niedostępny"}
            </strong>
            <span>{agentAccess.message}</span>
          </div>
        ) : (
          <>
            {agentAccess.data.canManage && openCreation === "agent" && (
              <AccessCreateDialog
                title={
                  agentTransport === "remote_hub"
                    ? "Dodaj zdalnego agenta"
                    : "Dodaj lokalnego agenta"
                }
                description="Najpierw określ możliwości, potem jawnie ogranicz dane, które agent może zobaczyć."
                open
                onClose={closeCreation}
              >
                <form className="agent-access-composer" onSubmit={submitAgent}>
                  <div className="agent-trust-boundary" aria-hidden="true">
                    <span>Co może zrobić</span>
                    <i />
                    <span>Co może zobaczyć</span>
                  </div>
                  <label className="agent-name-field">
                    <span>Nazwa agenta lub hosta</span>
                    <input
                      name="agent-name"
                      autoComplete="off"
                      value={agentName}
                      onChange={(event) => setAgentName(event.target.value)}
                      placeholder="np. Codex — praca projektowa"
                      maxLength={120}
                      disabled={busy}
                      required
                    />
                  </label>
                  <fieldset>
                    <legend>Poziom możliwości</legend>
                    {(
                      [
                        ["observe", "Obserwuj", "Tylko odczyt i dowody"],
                        [
                          "propose",
                          "Proponuj",
                          "Odczyt i sugestie w komentarzach",
                        ],
                        [
                          "operate",
                          "Działaj",
                          "Typowe zmiany bez administracji",
                        ],
                        [
                          "full_access",
                          "Pełny dostęp",
                          "Wszystkie przyznane operacje",
                        ],
                      ] as const
                    ).map(([value, label, description]) => (
                      <label key={value} className="agent-option">
                        <input
                          type="radio"
                          name="agent-preset"
                          checked={agentPreset === value}
                          onChange={() => setAgentPreset(value)}
                          disabled={busy}
                        />
                        <span>
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset
                    className="agent-space-scope"
                    aria-describedby={
                      showSpacesError ? "agent-spaces-error" : undefined
                    }
                  >
                    <legend>Zakres danych</legend>
                    {spaces.length === 0 ? (
                      <p className="access-boundary-note">
                        Ten workspace nie ma jeszcze żadnego Space, więc nie da
                        się przyznać zakresu danych. Grant utworzysz po dodaniu
                        pierwszego Space.
                      </p>
                    ) : (
                      spaces.map((space) => (
                        <label key={space.id} className="agent-option">
                          <input
                            type="checkbox"
                            checked={agentSpaces.includes(space.id)}
                            aria-invalid={showSpacesError}
                            aria-describedby={
                              showSpacesError ? "agent-spaces-error" : undefined
                            }
                            onChange={() => {
                              setSpacesTouched(true);
                              setAgentSpaces((current) =>
                                current.includes(space.id)
                                  ? current.filter((id) => id !== space.id)
                                  : [...current, space.id],
                              );
                            }}
                            disabled={busy}
                          />
                          <span>
                            <strong>{space.name}</strong>
                            <small>Relacje nie poszerzą tego zakresu.</small>
                          </span>
                        </label>
                      ))
                    )}
                  </fieldset>
                  <fieldset className="agent-expiry">
                    <legend>Wygaśnięcie</legend>
                    <label>
                      <input
                        type="radio"
                        name="agent-expiry"
                        checked={agentExpiry === "30_days"}
                        onChange={() => setAgentExpiry("30_days")}
                        disabled={busy}
                      />
                      30 dni
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="agent-expiry"
                        checked={agentExpiry === "never"}
                        onChange={() => setAgentExpiry("never")}
                        disabled={busy}
                      />
                      Bez terminu
                    </label>
                  </fieldset>
                  {agentTransport === "remote_hub" && (
                    <fieldset className="agent-federation-scope">
                      <legend>Granice między workspace</legend>
                      {(
                        [
                          [
                            "crossWorkspaceRead",
                            "Odczyt z innych przyznanych workspace",
                          ],
                          [
                            "derivedResultWrite",
                            "Zapis wyniku pochodnego do celu",
                          ],
                          [
                            "sourceMaterialization",
                            "Materializacja treści źródłowej",
                          ],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="agent-option">
                          <input
                            type="checkbox"
                            checked={federationScope[key]}
                            onChange={() =>
                              setFederationScope((current) => ({
                                ...current,
                                [key]: !current[key],
                              }))
                            }
                            disabled={busy}
                          />
                          <span>
                            <strong>{label}</strong>
                            <small>Osobny grant. Domyślnie wyłączony.</small>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <div className="access-dialog-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={closeCreation}
                      disabled={busy}
                    >
                      Anuluj
                    </button>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={busy}
                    >
                      {busy
                        ? "Zapisuję…"
                        : agentTransport === "remote_hub"
                          ? "Utwórz zdalny dostęp MCP"
                          : "Utwórz lokalny dostęp MCP"}
                    </button>
                  </div>
                  {showSpacesError && (
                    <p
                      id="agent-spaces-error"
                      className="field-error"
                      role="alert"
                    >
                      Wybierz co najmniej jeden Space.
                    </p>
                  )}
                </form>
              </AccessCreateDialog>
            )}

            <div className="agent-grant-list" aria-live="polite">
              {agentAccess.data.grants.length === 0 ? (
                <div className="agent-empty-state">
                  <span className="agent-orbit-mark" aria-hidden="true" />
                  <div>
                    <strong>Żaden host nie ma dostępu</strong>
                    <p>
                      Utwórz jawny grant, aby Codex, Claude lub inny host mógł
                      połączyć się przez{" "}
                      {agentTransport === "remote_hub" ? "Hub" : "lokalny MCP"}.
                    </p>
                  </div>
                </div>
              ) : (
                agentAccess.data.grants.map((grant) => (
                  <article
                    className={`agent-grant-row ${grant.status}`}
                    key={grant.grantId}
                  >
                    <span className="agent-orbit-mark" aria-hidden="true" />
                    <div className="agent-grant-identity">
                      <strong>{grant.displayName}</strong>
                      <span>
                        {grant.preset === "full_access"
                          ? "Pełny dostęp"
                          : grant.preset === "operate"
                            ? "Działa"
                            : grant.preset === "propose"
                              ? "Proponuje"
                              : "Obserwuje"}
                        {` · ${grant.spaces.map((space) => space.spaceName).join(", ")}`}
                      </span>
                      <small>
                        Poświadczenie v{grant.credentialVersion}
                        {grant.expiresAt
                          ? ` · wygasa ${new Intl.DateTimeFormat("pl", { dateStyle: "medium" }).format(new Date(grant.expiresAt))}`
                          : " · bez terminu"}
                      </small>
                    </div>
                    <span className={`access-state ${grant.status}`}>
                      {grant.status === "active"
                        ? "Aktywny"
                        : grant.status === "expired"
                          ? "Wygasł"
                          : "Cofnięty"}
                    </span>
                    {agentAccess.data.canManage &&
                      grant.status === "active" && (
                        <div className="member-actions">
                          {confirmAction === `agent-rotate-${grant.grantId}` ? (
                            <>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => setConfirmAction(undefined)}
                                disabled={busy}
                              >
                                Anuluj
                              </button>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => {
                                  setConfirmAction(undefined);
                                  onAgentRotate(grant);
                                }}
                                disabled={busy}
                              >
                                Potwierdź rotację
                              </button>
                            </>
                          ) : confirmAction === `agent-${grant.grantId}` ? (
                            <>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() => setConfirmAction(undefined)}
                                disabled={busy}
                              >
                                Anuluj
                              </button>
                              <button
                                className="quiet-danger-button"
                                type="button"
                                onClick={() => {
                                  setConfirmAction(undefined);
                                  onAgentRevoke(grant);
                                }}
                                disabled={busy}
                              >
                                Potwierdź cofnięcie
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="secondary-button"
                                type="button"
                                onClick={() =>
                                  setConfirmAction(
                                    `agent-rotate-${grant.grantId}`,
                                  )
                                }
                                disabled={busy}
                              >
                                Obróć poświadczenie
                              </button>
                              <button
                                className="quiet-danger-button"
                                type="button"
                                onClick={() =>
                                  setConfirmAction(`agent-${grant.grantId}`)
                                }
                                disabled={busy}
                              >
                                Cofnij dostęp
                              </button>
                            </>
                          )}
                        </div>
                      )}
                  </article>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </section>
  );
};
