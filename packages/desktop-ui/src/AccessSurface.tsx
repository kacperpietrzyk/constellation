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
/** Every level a person can choose; `custom` is only ever a grant's past. */
type GrantPreset = Exclude<AgentGrant["preset"], "custom">;

const presetLabel = (preset: AgentGrant["preset"]): string =>
  preset === "full_access"
    ? "Pełny dostęp"
    : preset === "operate"
      ? "Działa"
      : preset === "propose"
        ? "Proponuje"
        : preset === "custom"
          ? "Ręcznie dobrany"
          : "Obserwuje";

const sameSpaceSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((spaceId) => b.includes(spaceId));

/** The one taxonomy both the issuing and the editing dialog choose from. */
const GRANT_PRESETS = [
  ["observe", "Obserwuj", "Tylko odczyt i dowody"],
  ["propose", "Proponuj", "Odczyt i sugestie w komentarzach"],
  ["operate", "Działaj", "Typowe zmiany bez administracji"],
  ["full_access", "Pełny dostęp", "Wszystkie przyznane operacje"],
] as const satisfies readonly (readonly [GrantPreset, string, string])[];

/**
 * Polish counts split three ways and the relative pronoun follows the same
 * split, so the whole sentence is built here — assembled from parts at the
 * call site, the number and the pronoun could disagree.
 */
export const missingCapabilitiesNote = (count: number): string => {
  if (count === 1)
    return "Ten poziom niesie dziś 1 uprawnienie, którego ten grant nie ma — zapis je doda.";
  const teens = count % 100;
  const last = count % 10;
  const noun =
    last >= 2 && last <= 4 && !(teens >= 12 && teens <= 14)
      ? "uprawnienia"
      : "uprawnień";
  return `Ten poziom niesie dziś ${count} ${noun}, których ten grant nie ma — zapis je doda.`;
};

/**
 * Why saving is unavailable, or `undefined` when it is not. One string is both
 * the disabled condition and the sentence shown, so the button and the reason
 * cannot drift apart.
 */
export const rescopeBlockedReason = (
  grant: AgentGrant,
  preset: GrantPreset | undefined,
  spaceIds: readonly string[],
): string | undefined => {
  if (preset === undefined) return "Wybierz poziom możliwości, aby zapisać.";
  if (spaceIds.length === 0)
    return "Wybierz co najmniej jeden Space, aby zapisać.";
  // Restating the same level is not a no-op for a grant that predates an
  // upgrade: the command carries today's capability list for that level,
  // which is exactly what closes the drift.
  const closesDrift =
    grant.scopeStatus === "behind_preset" && preset === grant.preset;
  return preset !== grant.preset ||
    !sameSpaceSet(
      grant.spaces.map((space) => space.spaceId),
      spaceIds,
    ) ||
    closesDrift
    ? undefined
    : "Nic się nie zmienia — nie ma czego zapisać.";
};

/**
 * What the command should carry. Stating Spaces makes the kernel demand edit
 * rights on every Space stated, so a save that leaves the set alone states
 * none — otherwise a pure level change is refused over a Space this person
 * cannot edit and never meant to touch.
 */
export const rescopeTarget = (
  grant: AgentGrant,
  preset: GrantPreset,
  spaceIds: readonly SpaceId[],
): {
  readonly preset: GrantPreset;
  readonly spaceIds?: readonly SpaceId[];
} =>
  sameSpaceSet(
    grant.spaces.map((space) => space.spaceId),
    spaceIds,
  )
    ? { preset }
    : { preset, spaceIds };

const SpaceScopeOption = ({
  name,
  note,
  checked,
  disabled,
  invalid,
  describedBy,
  onToggle,
}: {
  readonly name: string;
  readonly note: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly invalid?: boolean | undefined;
  readonly describedBy?: string | undefined;
  readonly onToggle: () => void;
}) => (
  <label className="agent-option">
    <input
      type="checkbox"
      checked={checked}
      aria-invalid={invalid}
      aria-describedby={describedBy}
      onChange={onToggle}
      disabled={disabled}
    />
    <span>
      <strong>{name}</strong>
      <small>{note}</small>
    </span>
  </label>
);

/**
 * The difference a save would make, not the state it would set — a person
 * deciding needs to see what leaves and what arrives. Empty when the choices
 * still match the grant, so the caller can say why saving is unavailable
 * instead of describing a change that is not there.
 */
export const summariseRescope = (
  grant: AgentGrant,
  preset: GrantPreset | undefined,
  spaceIds: readonly string[],
  spaces: readonly { readonly id: SpaceId; readonly name: string }[],
): string => {
  const held: readonly string[] = grant.spaces.map((space) => space.spaceId);
  // A Space dropped from the workspace still exists on the grant, and only
  // the grant carries its name — otherwise a removal would read as a UUID.
  const nameOf = (spaceId: string): string =>
    spaces.find((space) => space.id === spaceId)?.name ??
    grant.spaces.find((space) => space.spaceId === spaceId)?.spaceName ??
    spaceId;
  const added = spaceIds.filter((spaceId) => !held.includes(spaceId));
  const removed = held.filter((spaceId) => !spaceIds.includes(spaceId));
  return [
    preset !== undefined && preset !== grant.preset
      ? `Poziom: ${presetLabel(grant.preset)} → ${presetLabel(preset)}.`
      : undefined,
    added.length > 0
      ? `Dodajesz dostęp do: ${added.map(nameOf).join(", ")}.`
      : undefined,
    removed.length > 0
      ? `Odbierasz dostęp do: ${removed.map(nameOf).join(", ")}.`
      : undefined,
  ]
    .filter((sentence) => sentence !== undefined)
    .join(" ");
};

const AccessDialog = ({
  eyebrow,
  title,
  description,
  open,
  onClose,
  children,
}: {
  readonly eyebrow: string;
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
      const first = dialog.querySelector<HTMLElement>(
        "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
      );
      // A radio group's focus belongs on the option that is chosen, the way
      // tabbing into one behaves: landing on an unchosen option turns the
      // first arrow key from navigation into a change nobody asked for.
      const selected =
        first instanceof HTMLInputElement &&
        first.type === "radio" &&
        !first.checked
          ? dialog.querySelector<HTMLElement>(
              `input[type="radio"][name="${CSS.escape(first.name)}"]:checked`,
            )
          : null;
      (selected ?? first)?.focus();
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
            <p className="eyebrow">{eyebrow}</p>
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
  onAgentRescope,
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
  /**
   * Resolves with the refusal the dialog should show and stay open for, or
   * with nothing when there is nothing left for it to do — the save landed,
   * or the caller refreshed the data the dialog was built from.
   */
  readonly onAgentRescope: (
    grant: AgentGrant,
    target: {
      readonly preset: GrantPreset;
      readonly spaceIds?: readonly SpaceId[];
    },
  ) => Promise<string | undefined>;
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
  const [rescoping, setRescoping] = useState<AgentGrant | undefined>(undefined);
  const [rescopePreset, setRescopePreset] = useState<GrantPreset | undefined>(
    undefined,
  );
  const [rescopeSpaceIds, setRescopeSpaceIds] = useState<readonly SpaceId[]>(
    [],
  );
  const [rescopeFailure, setRescopeFailure] = useState<string | undefined>(
    undefined,
  );
  // The surface clears its own busy flag before it reloads the projection, so
  // between a successful save and the dialog closing on it the button would be
  // live again — over a grant whose versions that save has already bumped.
  const [rescopeSaving, setRescopeSaving] = useState(false);
  // Each row owns its own trigger, so the button that opened the dialog is
  // captured on the way in rather than held in a ref per grant.
  const rescopeTriggerRef = useRef<HTMLButtonElement | null>(null);
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
  const openRescope = (grant: AgentGrant, trigger: HTMLButtonElement) => {
    rescopeTriggerRef.current = trigger;
    setRescoping(grant);
    // A hand-picked scope has no level to preselect; leaving it unchosen is
    // what makes the warning inside the dialog true.
    setRescopePreset(grant.preset === "custom" ? undefined : grant.preset);
    setRescopeSpaceIds(grant.spaces.map((space) => space.spaceId));
    setRescopeFailure(undefined);
    // The floor under the in-flight flag: an opened dialog is never mid-save,
    // whatever happened to the one before it.
    setRescopeSaving(false);
  };
  const closeRescope = () => {
    const trigger = rescopeTriggerRef.current;
    setRescoping(undefined);
    setRescopeFailure(undefined);
    requestAnimationFrame(() => {
      if (trigger?.isConnected === true) trigger.focus();
    });
  };
  // Every Space the grant holds gets a box, including one this person cannot
  // see in the workspace: a Space nobody was shown must never be restated on
  // their behalf, and the grant carries the name needed to show it.
  const rescopeSpaceOptions = [
    ...spaces.map((space) => ({
      id: space.id,
      name: space.name,
      note: "Relacje nie poszerzą tego zakresu.",
    })),
    ...(rescoping?.spaces ?? [])
      .filter((held) => !spaces.some((space) => space.id === held.spaceId))
      .map((held) => ({
        id: held.spaceId,
        name: held.spaceName,
        note: "Poza Twoim dostępem — ma go ten agent.",
      })),
  ];
  const rescopeClosesDrift =
    rescoping?.scopeStatus === "behind_preset" &&
    rescopePreset === rescoping.preset;
  const rescopeBlocked =
    rescoping === undefined
      ? undefined
      : rescopeBlockedReason(rescoping, rescopePreset, rescopeSpaceIds);
  const submitRescope = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || rescopeSaving || rescoping === undefined) return;
    if (rescopePreset === undefined || rescopeBlocked !== undefined) return;
    setRescopeFailure(undefined);
    setRescopeSaving(true);
    void onAgentRescope(
      rescoping,
      rescopeTarget(rescoping, rescopePreset, rescopeSpaceIds),
    )
      .then((failure) => {
        setRescopeSaving(false);
        // A refusal the person can answer leaves the versions this dialog read
        // intact, so it stays open holding them. Anything else — a save that
        // landed and bumped them, or a lost race the caller has already
        // refreshed under it — leaves nothing here worth keeping.
        if (failure === undefined) closeRescope();
        else setRescopeFailure(failure);
      })
      .catch(() => {
        // Reading the outcome failed, which says nothing about the command:
        // it may well have landed. Claiming a refusal would be a guess, and
        // stranding the flag would leave the dialog saving forever.
        setRescopeSaving(false);
        closeRescope();
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
        <AccessDialog
          eyebrow="Nowy dostęp"
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
        </AccessDialog>
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
              <AccessDialog
                eyebrow="Nowy dostęp"
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
                    {GRANT_PRESETS.map(([value, label, description]) => (
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
                        <SpaceScopeOption
                          key={space.id}
                          name={space.name}
                          note="Relacje nie poszerzą tego zakresu."
                          checked={agentSpaces.includes(space.id)}
                          invalid={showSpacesError}
                          describedBy={
                            showSpacesError ? "agent-spaces-error" : undefined
                          }
                          disabled={busy}
                          onToggle={() => {
                            setSpacesTouched(true);
                            setAgentSpaces((current) =>
                              current.includes(space.id)
                                ? current.filter((id) => id !== space.id)
                                : [...current, space.id],
                            );
                          }}
                        />
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
              </AccessDialog>
            )}

            {agentAccess.data.canManage && rescoping !== undefined && (
              <AccessDialog
                eyebrow="Zmiana uprawnień"
                title={`Zmień uprawnienia: ${rescoping.displayName}`}
                description="Poziom możliwości i zakres danych zmieniają się razem, jednym zapisem. Poświadczenie zostaje bez zmian."
                open
                onClose={closeRescope}
              >
                <form
                  className="agent-access-composer"
                  onSubmit={submitRescope}
                >
                  <div className="agent-trust-boundary" aria-hidden="true">
                    <span>Co może zrobić</span>
                    <i />
                    <span>Co może zobaczyć</span>
                  </div>
                  <fieldset>
                    <legend>Poziom możliwości</legend>
                    {GRANT_PRESETS.map(([value, label, description]) => (
                      <label key={value} className="agent-option">
                        <input
                          type="radio"
                          name="rescope-preset"
                          checked={rescopePreset === value}
                          onChange={() => setRescopePreset(value)}
                          disabled={busy}
                        />
                        <span>
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="agent-space-scope">
                    <legend>Zakres danych</legend>
                    {rescopeSpaceOptions.length === 0 ? (
                      <p className="access-boundary-note">
                        Ten workspace nie ma jeszcze żadnego Space, więc nie da
                        się zmienić zakresu danych.
                      </p>
                    ) : (
                      rescopeSpaceOptions.map((space) => (
                        <SpaceScopeOption
                          key={space.id}
                          name={space.name}
                          note={space.note}
                          checked={rescopeSpaceIds.includes(space.id)}
                          disabled={busy}
                          onToggle={() =>
                            setRescopeSpaceIds((current) =>
                              current.includes(space.id)
                                ? current.filter((id) => id !== space.id)
                                : [...current, space.id],
                            )
                          }
                        />
                      ))
                    )}
                  </fieldset>
                  {rescoping.preset === "custom" && (
                    <p className="access-dialog-note">
                      Ten grant ma ręcznie dobrany zestaw uprawnień. Wybór
                      poziomu zastąpi go w całości.
                    </p>
                  )}
                  {rescopeClosesDrift && (
                    <p className="access-dialog-note">
                      {missingCapabilitiesNote(
                        rescoping.missingFromPreset.length,
                      )}
                    </p>
                  )}
                  {/* The difference is the decision, and it changes with every
                      box ticked — a person who cannot see the dialog has to
                      hear it, including the reason saving is unavailable. */}
                  <p className="access-dialog-note" aria-live="polite">
                    {rescopeBlocked ??
                      `${summariseRescope(rescoping, rescopePreset, rescopeSpaceIds, spaces)} Zadziała od następnego wywołania agenta — bez ponownego łączenia.`.trim()}
                  </p>
                  <div className="access-dialog-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={closeRescope}
                      disabled={busy || rescopeSaving}
                    >
                      Anuluj
                    </button>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={
                        busy || rescopeSaving || rescopeBlocked !== undefined
                      }
                    >
                      {busy || rescopeSaving
                        ? "Zapisuję…"
                        : "Zapisz uprawnienia"}
                    </button>
                  </div>
                  {/* A refused save is answered where the choice was made: the
                      dialog still holds the versions it read, so the person can
                      change what was refused instead of rebuilding it. */}
                  {rescopeFailure !== undefined && (
                    <p className="field-error" role="alert">
                      {rescopeFailure}
                    </p>
                  )}
                </form>
              </AccessDialog>
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
                        {presetLabel(grant.preset)}
                        {` · ${grant.spaces.map((space) => space.spaceName).join(", ")}`}
                      </span>
                      <small>
                        Poświadczenie v{grant.credentialVersion}
                        {grant.expiresAt
                          ? ` · wygasa ${new Intl.DateTimeFormat("pl", { dateStyle: "medium" }).format(new Date(grant.expiresAt))}`
                          : " · bez terminu"}
                        {grant.scopeStatus === "behind_preset" &&
                          ` · zakres sprzed aktualizacji: brakuje ${grant.missingFromPreset.length} uprawnień tego poziomu`}
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
                              {
                                // Re-scoping is a local-kernel command; a Hub
                                // grant is changed through the Hub's own
                                // management API, which has no scope method yet.
                                // Drift is still worth naming above — it explains
                                // a refusal — but offering an action that cannot
                                // reach the grant would be worse than offering
                                // none.
                                agentTransport !== "remote_hub" && (
                                  <button
                                    className="secondary-button"
                                    type="button"
                                    aria-haspopup="dialog"
                                    onClick={(event) =>
                                      openRescope(grant, event.currentTarget)
                                    }
                                    disabled={busy}
                                  >
                                    Zmień uprawnienia
                                  </button>
                                )
                              }
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
