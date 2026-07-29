import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  spaceAccessForPreset,
  type AccessProjection,
  type AgentAccessProjection,
  type DataSlice,
} from "./client/workflow.js";
import type { SpaceId } from "@constellation/contracts";

import { Icon } from "./components/Icon.js";
import { reportFirstEmptyRequiredField } from "./components/InlinePopover.js";
import { countLabel, formatDate, plural } from "./i18n.js";

type Member = AccessProjection["members"][number];
type AgentGrant = AgentAccessProjection["grants"][number];
/** Every level a person can choose; `custom` is only ever a grant's past. */
type GrantPreset = Exclude<AgentGrant["preset"], "custom">;

const presetLabel = (preset: AgentGrant["preset"]): string =>
  preset === "full_access"
    ? "Full access"
    : preset === "operate"
      ? "Acts"
      : preset === "propose"
        ? "Proposes"
        : preset === "custom"
          ? "Hand-picked"
          : "Observes";

const sameSpaceSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((spaceId) => b.includes(spaceId));

/** The one taxonomy both the issuing and the editing dialog choose from. */
const GRANT_PRESETS = [
  ["observe", "Observe", "Read and evidence only"],
  ["propose", "Propose", "Read and suggest in comments"],
  ["operate", "Act", "Everyday changes, no administration"],
  ["full_access", "Full access", "Every granted operation"],
] as const satisfies readonly (readonly [GrantPreset, string, string])[];

/**
 * The whole sentence is built here rather than assembled at the call site: the
 * count and the pronoun that refers back to it have to agree, and a caller
 * joining parts can let them drift.
 */
export const missingCapabilitiesNote = (count: number): string =>
  `This level now carries ${countLabel(count, "permission")} this grant lacks — saving adds ${plural(count, "it", "them")}.`;

/**
 * The same count as a clause the grant row folds into a longer line. Kept
 * beside {@link missingCapabilitiesNote} so the two counts cannot read
 * differently for the same grant.
 */
export const missingCapabilitiesClause = (count: number): string =>
  `missing ${countLabel(count, "permission")}`;

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
  if (preset === undefined) return "Choose a capability level to save.";
  if (spaceIds.length === 0) return "Choose at least one Space to save.";
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
    : "Nothing changes — there is nothing to save.";
};

/**
 * What the command should carry. Stating Spaces makes the kernel demand edit
 * rights on every Space stated, so a save that would leave every Space grant
 * exactly as it stands states none — otherwise a pure level change is refused
 * over a Space this person cannot edit and never meant to touch.
 *
 * That omission cannot be unconditional, because the level drives two gates,
 * not one: the grant's capability scope, and each Space grant's own `access`,
 * which the kernel rewrites only for the Spaces a command states. A level
 * raised with the Space set left alone would hand the agent `operate`
 * capabilities behind `view` access, and every command it may now supposedly
 * perform would still be refused at the Space. So the set being unchanged is
 * only half the test — the level each held Space already carries has to match
 * the chosen preset as well.
 */
export const rescopeTarget = (
  grant: AgentGrant,
  preset: GrantPreset,
  spaceIds: readonly SpaceId[],
): {
  readonly preset: GrantPreset;
  readonly spaceIds?: readonly SpaceId[];
} => {
  const access = spaceAccessForPreset(preset);
  return sameSpaceSet(
    grant.spaces.map((space) => space.spaceId),
    spaceIds,
  ) && grant.spaces.every((space) => space.access === access)
    ? { preset }
    : { preset, spaceIds };
};

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
      ? `Level: ${presetLabel(grant.preset)} → ${presetLabel(preset)}.`
      : undefined,
    added.length > 0
      ? `Adding access to: ${added.map(nameOf).join(", ")}.`
      : undefined,
    removed.length > 0
      ? `Removing access to: ${removed.map(nameOf).join(", ")}.`
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
            aria-label={`Close: ${title}`}
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
      note: "Relationships do not widen this scope.",
    })),
    ...(rescoping?.spaces ?? [])
      .filter((held) => !spaces.some((space) => space.id === held.spaceId))
      .map((held) => ({
        id: held.spaceId,
        name: held.spaceName,
        note: "Outside your access — this agent has it.",
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
              Access
            </h1>
            <p>The current access policy could not be read.</p>
          </div>
        </header>
        <div className="access-unavailable" role="alert">
          <strong>Access is unavailable</strong>
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
            Access
          </h1>
          <p>Who can work in this workspace, and how far that reaches.</p>
        </div>
        <span className="policy-version">Policy v{current.policyVersion}</span>
      </header>

      <section className="access-ledger" aria-labelledby="member-list-title">
        <header className="access-ledger-heading">
          <div>
            <h2 id="member-list-title">People</h2>
            <p>Workspace role and Space access stay independent.</p>
          </div>
          <div className="access-ledger-actions">
            <span className="access-ledger-count">
              {
                current.members.filter((member) => member.status === "active")
                  .length
              }{" "}
              active
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
                Add person
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
                    {self ? " · You" : ""}
                  </strong>
                  <span>
                    {member.role === "owner"
                      ? "Owner"
                      : member.role === "admin"
                        ? "Admin"
                        : member.role === "guest"
                          ? "Guest"
                          : "Member"}
                    {grant
                      ? ` · ${grant.spaceName}`
                      : member.role === "owner"
                        ? " · primary Space"
                        : " · no active Space"}
                  </span>
                </div>
                <span className={`access-state ${member.status}`}>
                  {member.status === "active" ? "Active" : "Revoked"}
                </span>
                {current.canManage && !self && member.status === "active" && (
                  <div className="member-actions">
                    {grant && (
                      <label>
                        <span className="sr-only">
                          Access for {member.displayName}
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
                          <option value="view">View only</option>
                          <option value="comment">Can comment</option>
                          <option value="edit">Can edit</option>
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
                          Cancel
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
                          Confirm revoke
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
                        Revoke access
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
          eyebrow="New access"
          title="Add person"
          description="Create a lasting identity; grant the workspace role and Space access separately."
          open
          onClose={closeCreation}
        >
          <form className="access-composer" onSubmit={submit}>
            <label>
              <span>Person name</span>
              <input
                name="display-name"
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="e.g. Ada Nowak"
                maxLength={120}
                disabled={busy}
                required
              />
            </label>
            <label>
              <span>Workspace role</span>
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as "admin" | "member" | "guest")
                }
                disabled={busy}
              >
                <option value="member">Member</option>
                <option value="guest">Guest</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <fieldset>
              <legend>Access in the current Space</legend>
              <label>
                <input
                  type="radio"
                  name="space-access"
                  checked={spaceAccess === "comment"}
                  onChange={() => setSpaceAccess("comment")}
                  disabled={busy}
                />
                Can comment
              </label>
              <label>
                <input
                  type="radio"
                  name="space-access"
                  checked={spaceAccess === "view"}
                  onChange={() => setSpaceAccess("view")}
                  disabled={busy}
                />
                View only
              </label>
              <label>
                <input
                  type="radio"
                  name="space-access"
                  checked={spaceAccess === "edit"}
                  onChange={() => setSpaceAccess("edit")}
                  disabled={busy}
                />
                Can edit
              </label>
            </fieldset>
            <p className="access-boundary-note">
              Access never includes hidden Spaces. Full capabilities never widen
              the data scope.
            </p>
            <div className="access-dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={closeCreation}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Create access"}
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
              {agentTransport === "remote_hub" ? "remote via Hub" : "local"}
            </p>
            <h2 id="agent-access-title">External agents</h2>
            <p>
              Capabilities and data are separate boundaries. Full access stays
              inside the chosen Spaces.
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
                active
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
                  Add agent
                </button>
              )}
            </div>
          )}
        </header>

        {agentAccess.kind === "unavailable" ? (
          <div className="access-unavailable" role="alert">
            <strong>
              {agentTransport === "remote_hub"
                ? "Remote MCP is unavailable"
                : "Local MCP is unavailable"}
            </strong>
            <span>{agentAccess.message}</span>
          </div>
        ) : (
          <>
            {agentAccess.data.canManage && openCreation === "agent" && (
              <AccessDialog
                eyebrow="New access"
                title={
                  agentTransport === "remote_hub"
                    ? "Add remote agent"
                    : "Add local agent"
                }
                description="Set the capabilities first, then limit the data the agent can see."
                open
                onClose={closeCreation}
              >
                <form className="agent-access-composer" onSubmit={submitAgent}>
                  <div className="agent-trust-boundary" aria-hidden="true">
                    <span>What it can do</span>
                    <i />
                    <span>What it can see</span>
                  </div>
                  <label className="agent-name-field">
                    <span>Agent or host name</span>
                    <input
                      name="agent-name"
                      autoComplete="off"
                      value={agentName}
                      onChange={(event) => setAgentName(event.target.value)}
                      placeholder="e.g. Codex — project work"
                      maxLength={120}
                      disabled={busy}
                      required
                    />
                  </label>
                  <fieldset>
                    <legend>Capability level</legend>
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
                    <legend>Data scope</legend>
                    {spaces.length === 0 ? (
                      <p className="access-boundary-note">
                        This workspace has no Space yet, so there is no data
                        scope to grant. Add the first Space, then create the
                        grant.
                      </p>
                    ) : (
                      spaces.map((space) => (
                        <SpaceScopeOption
                          key={space.id}
                          name={space.name}
                          note="Relationships do not widen this scope."
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
                    <legend>Expiry</legend>
                    <label>
                      <input
                        type="radio"
                        name="agent-expiry"
                        checked={agentExpiry === "30_days"}
                        onChange={() => setAgentExpiry("30_days")}
                        disabled={busy}
                      />
                      30 days
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="agent-expiry"
                        checked={agentExpiry === "never"}
                        onChange={() => setAgentExpiry("never")}
                        disabled={busy}
                      />
                      No expiry
                    </label>
                  </fieldset>
                  {agentTransport === "remote_hub" && (
                    <fieldset className="agent-federation-scope">
                      <legend>Cross-workspace boundaries</legend>
                      {(
                        [
                          [
                            "crossWorkspaceRead",
                            "Read from other granted workspaces",
                          ],
                          [
                            "derivedResultWrite",
                            "Write derived results to the target",
                          ],
                          [
                            "sourceMaterialization",
                            "Materialize source content",
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
                            <small>A separate grant. Off by default.</small>
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
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={busy}
                    >
                      {busy
                        ? "Saving…"
                        : agentTransport === "remote_hub"
                          ? "Create remote MCP access"
                          : "Create local MCP access"}
                    </button>
                  </div>
                  {showSpacesError && (
                    <p
                      id="agent-spaces-error"
                      className="field-error"
                      role="alert"
                    >
                      Choose at least one Space.
                    </p>
                  )}
                </form>
              </AccessDialog>
            )}

            {agentAccess.data.canManage && rescoping !== undefined && (
              <AccessDialog
                eyebrow="Change permissions"
                title={`Change permissions: ${rescoping.displayName}`}
                description="Capability level and data scope change together, in one save. The credential stays."
                open
                onClose={closeRescope}
              >
                <form
                  className="agent-access-composer"
                  onSubmit={submitRescope}
                >
                  <div className="agent-trust-boundary" aria-hidden="true">
                    <span>What it can do</span>
                    <i />
                    <span>What it can see</span>
                  </div>
                  <fieldset>
                    <legend>Capability level</legend>
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
                    <legend>Data scope</legend>
                    {rescopeSpaceOptions.length === 0 ? (
                      <p className="access-boundary-note">
                        This workspace has no Space yet, so there is no data
                        scope to change.
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
                      This grant has a hand-picked set of permissions. Choosing
                      a level replaces all of it.
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
                      `${summariseRescope(rescoping, rescopePreset, rescopeSpaceIds, spaces)} Takes effect on the agent's next call — no reconnect.`.trim()}
                  </p>
                  <div className="access-dialog-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={closeRescope}
                      disabled={busy || rescopeSaving}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={
                        busy || rescopeSaving || rescopeBlocked !== undefined
                      }
                    >
                      {busy || rescopeSaving ? "Saving…" : "Save permissions"}
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
                    <strong>No host has access</strong>
                    <p>
                      Create an explicit grant so Codex, Claude or another host
                      can connect through{" "}
                      {agentTransport === "remote_hub"
                        ? "the Hub"
                        : "local MCP"}
                      .
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
                        Credential v{grant.credentialVersion}
                        {grant.expiresAt
                          ? ` · expires ${formatDate(grant.expiresAt)}`
                          : " · no expiry"}
                        {/* Drift is a repair, and only an active grant can be
                            repaired — a revoked or expired grant authorizes
                            nothing, so naming its stale scope sends a person
                            to fix a grant that is already closed. */}
                        {grant.status === "active" &&
                          grant.scopeStatus === "behind_preset" &&
                          ` · scope from before an update: ${missingCapabilitiesClause(grant.missingFromPreset.length)} from this level`}
                      </small>
                    </div>
                    <span className={`access-state ${grant.status}`}>
                      {grant.status === "active"
                        ? "Active"
                        : grant.status === "expired"
                          ? "Expired"
                          : "Revoked"}
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
                                Cancel
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
                                Confirm rotation
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
                                Cancel
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
                                Confirm revoke
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
                                    Change permissions
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
                                Rotate credential
                              </button>
                              <button
                                className="quiet-danger-button"
                                type="button"
                                onClick={() =>
                                  setConfirmAction(`agent-${grant.grantId}`)
                                }
                                disabled={busy}
                              >
                                Revoke access
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
