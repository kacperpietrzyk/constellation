import {
  DEFAULT_COMMERCIAL_DEFAULTS,
  DEFAULT_WORKING_DAY,
} from "@constellation/contracts";
import {
  AttentionSignalIdSchema,
  CommentIdSchema,
  FieldDefinitionIdSchema,
  GrantIdSchema,
  PrincipalIdSchema,
  ProjectIdSchema,
  ProjectTemplateIdSchema,
  StrategicRecordIdSchema,
  TaskAssignmentIdSchema,
  SpaceIdSchema,
  TaskIdSchema,
  TaskStatusIdSchema,
  WorkspaceIdSchema,
  type QueryProjection,
} from "@constellation/contracts";
import type {
  RendererCommandResponse,
  RendererQueryResponse,
} from "@constellation/desktop-preload/client";

import { RealApp } from "../RealApp.js";
import { createScenarioClient } from "../client/scenario-client.js";
import { crmRecords } from "./crm-fixture.js";
import {
  libraryCaptures,
  libraryDocumentIds,
  libraryDocuments,
  libraryFolders,
  libraryNoteState,
  librarySources,
  librarySummaries,
} from "./library-fixture.js";

// Parsed rather than declared as strings, so the branded ids the projections
// ask for are branded HERE once instead of cast at forty use sites.
const workspaceId = WorkspaceIdSchema.parse(
  "00000000-0000-4000-8000-000000000001",
);
const spaceId = SpaceIdSchema.parse("00000000-0000-4000-8000-000000000002");
const statusId = TaskStatusIdSchema.parse(
  "00000000-0000-4000-8000-000000000003",
);
const ownerId = PrincipalIdSchema.parse("00000000-0000-4000-8000-000000000004");
const memberId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-000000000005",
);
// The agent is a PRINCIPAL like any other, and that is not a detail of naming:
// a comment is attributed to an agent by matching this id against the grants in
// `agent.access` (`record-actors.ts:93-111`), so the id has to be shared by the
// grant and by the comment or the panel quietly draws a person.
const agentPrincipalId = PrincipalIdSchema.parse(
  "00000000-0000-4000-8000-0000000000f2",
);
const taskId = TaskIdSchema.parse("00000000-0000-4000-8000-000000000006");
// Jedno źródło tytułu zadania i identyfikatora projektu, bo od tego PR-a
// fikstura Library niesie ODWOŁANIA do obu i musi nazywać je tak samo, jak
// nazywają się w swoich własnych projekcjach — grupa `Record` z tytułem, który
// rozjechał się z rekordem, wygląda na przetestowaną i mierzy dwie różne rzeczy.
const taskTitle = "Potwierdź wariant recovery";
const libraryProjectId = ProjectIdSchema.parse(
  "00000000-0000-4000-8000-0000000000d1",
);
const rootCommentId = CommentIdSchema.parse(
  "00000000-0000-4000-8000-000000000007",
);

// Typed by the CONTRACT, not by `Record<string, unknown>`.
//
// It was the loose type, and a fixture is where that costs most: this harness
// described a task with no `attachments`, which the projection requires, and
// the rail's attachments section read `.length` off it and took the whole shell
// down the moment anybody clicked a task row. Nothing failed at compile time
// and no test noticed, because the only thing that renders this harness is a
// browser. A fixture that cannot be wrong about the shape is the only version
// of this worth keeping.
const result = (projection: QueryProjection): RendererQueryResponse =>
  ({
    kind: "query_result",
    result: {
      contractVersion: 1,
      queryId: "00000000-0000-4000-8000-000000000099",
      kernelTime: "2026-07-14T12:00:00.000Z",
      outcome: "success",
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
      projection,
    },
  }) as unknown as RendererQueryResponse;

const client = createScenarioClient({
  documentState: (documentId) =>
    documentId === libraryDocumentIds.runbook
      ? libraryNoteState(taskId)
      : undefined,
  executeCommand: (command): RendererCommandResponse => {
    if (
      command.commandName !== "attention.markRead" &&
      command.commandName !== "attention.dismiss"
    ) {
      return {
        kind: "contract_rejected",
        diagnosticCode: "contract.invalid",
        issues: [{ path: "", code: "custom" }],
      };
    }
    const diagnosticCode =
      command.commandName === "attention.markRead"
        ? "attention.read"
        : "attention.dismissed";
    return {
      kind: "command_outcome",
      outcome: {
        contractVersion: 1,
        commandId: command.commandId,
        correlationId: command.correlationId,
        kernelTime: "2026-07-14T12:00:00.000Z",
        outcome: "success",
        diagnosticCode,
        affected: [],
        auditReceiptId: "00000000-0000-4000-8000-000000000015",
        projection: {
          kind: diagnosticCode,
          attentionSignalId: command.payload.attentionSignalId,
          version: 2,
        },
      },
    } as unknown as RendererCommandResponse;
  },
  queries: {
    "workspace.bootstrapContext": result({
      kind: "workspace.bootstrapContext",
      workspace: {
        id: workspaceId,
        name: "Praca",
        timezone: "Europe/Warsaw",
        defaultTaskStatusId: statusId,
        voiceAudioRetentionPolicy: "delete_after_transcript",
        // Projekcja NIGDY nie oddaje tego pola puste — harness, który je
        // pomija, opisuje świat, którego nie ma, i wywala powłokę na starcie.
        workingDay: DEFAULT_WORKING_DAY,
        commercialDefaults: DEFAULT_COMMERCIAL_DEFAULTS,
        version: 4,
      },
      spaces: [{ id: spaceId, name: "Praca", version: 1 }],
      taskStatuses: [
        {
          id: statusId,
          label: "W toku",
          operationalSemantics: "actionable",
          position: 0,
          version: 1,
        },
      ],
      fieldDefinitions: [
        {
          id: FieldDefinitionIdSchema.parse(
            "00000000-0000-4000-8000-0000000000e1",
          ),
          targetKind: "task",
          label: "Segment",
          type: { kind: "choice", options: ["MSSP", "Enterprise"] },
          position: 0,
          version: 1,
        },
      ],
      projectTemplates: [
        {
          id: ProjectTemplateIdSchema.parse(
            "00000000-0000-4000-8000-0000000000c1",
          ),
          name: "Wdrożenie klienta",
          taskTitles: ["Kickoff", "Plan wdrożenia", "Retro"],
          fieldIds: [],
          position: 0,
          version: 1,
        },
      ],
    }),
    "task.list": result({
      kind: "task.list",
      items: [
        {
          id: taskId,
          spaceId,
          title: taskTitle,
          status: {
            id: statusId,
            label: "W toku",
            operationalSemantics: "actionable",
          },
          completionState: "open",
          // THE WRITTEN CONTEXT, and the only projection that carries it. The
          // record screen reads `description` off THIS capped list
          // (`TaskRecordScreen.tsx:386` — `snapshot.tasks.find(...)`), never off
          // `work.overview`, and it draws `.prose` only when the string is
          // non-empty (`:585-599`). While this field was absent the screen drew
          // the "No context saved yet" note instead, so the reading measure of
          // the whole record family — the one thing lot 4 #12 is about — was
          // never on the page for anything to measure.
          //
          // Several paragraphs, split by a blank line, because `paragraphsOf`
          // splits on exactly that: a one-sentence description exercises
          // neither the `gap` between paragraphs nor the `pre-wrap` rule that
          // keeps an author's own single newlines.
          description:
            "The packaged build recovers a half-written capture on the next start, and we have never watched it do that from a cold machine — only from a session that still had the renderer warm.\n\nWhat needs confirming is the order: the recovery banner has to appear BEFORE the workspace finishes opening, otherwise the reader answers a question about a capture they cannot yet see. Ada saw the opposite order once on Windows and we have no recording of it.\n\nIf the order is wrong the fix is not in the banner, it is in when the startup notice is allowed to resolve.",
          nextAction:
            "Reproduce from a cold start on Windows and record the order the two notices appear in.",
          assignment: {
            id: TaskAssignmentIdSchema.parse(
              "00000000-0000-4000-8000-000000000008",
            ),
            // Flat, because that is what the projection carries. The nested
            // `assignee` object this used to hold was the shape of an older
            // contract, and an untyped fixture kept it alive long after the
            // projection stopped answering that way.
            assigneePrincipalId: memberId,
            displayName: "Ada Nowak",
            availability: "active",
            version: 1,
          },
          // Required, and its absence is what the loose type cost: the rail's
          // attachments section reads `.length` off this, so clicking any task
          // row in this harness took the whole shell down with a TypeError.
          attachments: [],
          createdAt: "2026-07-14T09:30:00.000Z",
          updatedAt: "2026-07-14T10:51:00.000Z",
          version: 2,
        },
      ],
      nextCursor: null,
    }),
    "work.overview": result({
      kind: "work.overview",
      tasks: [
        {
          id: taskId,
          title: taskTitle,
          statusId,
          // NOT "actionable", and the difference is a whole element. The record
          // says the operational state out loud only when it is NOT the default
          // (`TaskRecordScreen.tsx:507`) — an "actionable" task draws no
          // `.why` span at all. A harness whose only task was actionable
          // therefore held a screen on which lot 4 #2's subject did not exist,
          // and the pair reading it was unfalsifiable rather than pending.
          operationalState: "waiting",
          waitingOn: {
            kind: "person",
            label: "Ada Nowak · Windows reproduction",
          },
          completionState: "open",
          fields: {
            "00000000-0000-4000-8000-0000000000e1": {
              kind: "choice",
              value: "MSSP",
            },
          },
          // WYMAGANE od B2, nie opcjonalne: bez tego cały odczyt
          // `work.overview` nie przechodzi strict-parse i płaszczyzna pracy
          // czyta się jako niedostępna — a harness wygląda wtedy dokładnie
          // tak, jakby ekran był zepsuty.
          projectIds: [],
          version: 3,
          updatedAt: "2026-07-14T11:30:00.000Z",
        },
      ],
      projects: [],
      areas: [],
      initiatives: [],
      links: [],
      savedViews: [
        {
          id: StrategicRecordIdSchema.parse(
            "00000000-0000-4000-8000-0000000000e2",
          ),
          name: "Segment MSSP",
          filters: {
            fields: [
              {
                fieldId: FieldDefinitionIdSchema.parse(
                  "00000000-0000-4000-8000-0000000000e1",
                ),
                predicate: { kind: "choice_is", option: "MSSP" },
              },
            ],
          },
          sort: "updated_desc",
          groupBy: "status",
          state: "active",
          version: 1,
        },
      ],
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
    }),
    "project.list": result({
      kind: "project.list",
      items: [
        {
          id: libraryProjectId,
          spaceId,
          title: "Orbit onboarding",
          intendedOutcome: "Klient pracuje samodzielnie w Constellation",
          needsReview: false,
          lifecycle: "active",
          relatedOpenTaskCount: 0,
          version: 2,
          updatedAt: "2026-07-14T11:00:00.000Z",
        },
      ],
    }),
    "project.operationalOverview": result({
      kind: "project.operationalOverview",
      project: {
        id: libraryProjectId,
        spaceId,
        title: "Orbit onboarding",
        intendedOutcome: "Klient pracuje samodzielnie w Constellation",
        needsReview: false,
        lifecycle: "active",
        version: 2,
        updatedAt: "2026-07-14T11:00:00.000Z",
      },
      relatedTasks: [],
      relatedMeetings: [],
      // Notatka PRZYPIĘTA DO PROJEKTU, obok luźnych na liście Library. Dziś to
      // jedyne miejsce, w którym ten fakt w ogóle da się pokazać: żadna
      // projekcja czytana przez Library nie niesie przypisania do Projektu.
      relatedDocuments: [
        {
          id: libraryDocumentIds.handover,
          title: "Orbit — dokumentacja powdrożeniowa dla zespołu utrzymania",
          role: "deliverable" as const,
          version: 7,
          updatedAt: "2026-07-31T11:05:00.000Z",
        },
      ],
      // ONE EXIT, and it is not decoration. `ProjectRecordOverview.tsx:570`
      // leaves the whole Decisions section out when the collection is empty,
      // and the Client section is not a way in either — it lists
      // `clients.slice(1)`, so a single client draws ZERO rows by design. With
      // all four collections empty this rail drew nothing but the version line,
      // and `.railRow` — the subject of lot 4 #7 — did not exist on the page at
      // all. `superseded` rather than `current` because that is the only state
      // the row says out loud (`:580`), so the `meta` span draws too instead of
      // being a branch nothing on this fixture reaches.
      relatedDecisions: [
        {
          id: StrategicRecordIdSchema.parse(
            "00000000-0000-4000-8000-0000000000f1",
          ),
          title: "Migrujemy notatki klienta z Obsidiana, nie z Confluence",
          state: "superseded" as const,
          version: 3,
          updatedAt: "2026-07-28T09:20:00.000Z",
        },
      ],
      clientOrganizations: [],
      evidenceSources: [],
    }),
    "document.linkCandidates": result({
      kind: "document.linkCandidates",
      items: [
        {
          targetKind: "task",
          targetId: taskId,
          label: taskTitle,
        },
      ],
    }),
    // Historia przechwyceń oddawała `items: []`, więc Library mierzyła się
    // pusta. Szczegóły i granica użycia tej fikstury: `library-fixture.ts`.
    "capture.history": result({
      kind: "capture.history",
      items: libraryCaptures(spaceId, {
        taskId,
        principalId: ownerId,
      }),
      nextCursor: null,
    }),
    "document.list": result({
      kind: "document.list",
      items: libraryDocuments(spaceId),
    }),
    "knowledge.list": result({
      kind: "knowledge.list",
      spaceId,
      folders: libraryFolders(),
      sources: librarySources(),
      documents: librarySummaries({
        task: { id: taskId, label: taskTitle },
        project: { id: libraryProjectId, label: "Orbit onboarding" },
      }),
    }),
    "task.assignmentCandidates": result({
      kind: "task.assignmentCandidates",
      spaceId,
      candidates: [
        {
          principalId: memberId,
          displayName: "Ada Nowak",
          participantKind: "member",
        },
      ],
    }),
    "workspace.access": result({
      kind: "workspace.access",
      policyVersion: 4,
      currentPrincipalId: ownerId,
      canManage: true,
      members: [
        {
          membershipId: "00000000-0000-4000-8000-000000000010",
          principalId: ownerId,
          displayName: "Kacper",
          role: "owner",
          status: "active",
          version: 1,
          spaces: [],
        },
        {
          membershipId: "00000000-0000-4000-8000-000000000011",
          principalId: memberId,
          displayName: "Ada Nowak",
          role: "member",
          status: "active",
          version: 1,
          spaces: [
            {
              spaceGrantId: "00000000-0000-4000-8000-000000000012",
              spaceId,
              spaceName: "Praca",
              access: "comment",
              status: "active",
              version: 1,
            },
          ],
        },
      ],
    }),
    // WITHOUT THIS QUERY THERE ARE NO AGENTS IN THIS WORKSPACE, and the shell
    // says so silently: `buildActorResolver` reads its map out of
    // `agentAccess.grants`, and an unavailable slice makes that map empty, so
    // every comment resolves to a person. The whole agent treatment on a record
    // — the spark, the accent mark, the "agent · preset" line — hangs off this
    // one read.
    "agent.access": result({
      kind: "agent.access",
      policyVersion: 4,
      workspaceVersion: 4,
      canManage: true,
      grants: [
        {
          grantId: GrantIdSchema.parse("00000000-0000-4000-8000-0000000000f3"),
          agentPrincipalId,
          displayName: "Orbit Runner",
          // A REAL preset value, because the panel prints it beside the name
          // (`RecordCommentsPanel.tsx:177` — "agent · propose"). An invented
          // string would fail the strict parse and take the slice, not just
          // the word, off the screen.
          preset: "propose",
          capabilityScope: [
            "task.comment",
            "task.update",
            "document.structuredRead",
          ],
          scopeStatus: "current",
          missingFromPreset: [],
          status: "active",
          credentialVersion: 1,
          version: 2,
          membershipId: "00000000-0000-4000-8000-0000000000f4",
          membershipVersion: 1,
          spaces: [
            {
              spaceId,
              spaceName: "Praca",
              spaceGrantId: "00000000-0000-4000-8000-0000000000f5",
              access: "comment",
              version: 1,
            },
          ],
          lastUsedAt: "2026-07-14T10:51:00.000Z",
        },
      ],
    }),
    "comment.mentionCandidates": result({
      kind: "comment.mentionCandidates",
      spaceId,
      candidates: [
        {
          principalId: ownerId,
          displayName: "Kacper",
          participantKind: "member",
        },
        {
          principalId: memberId,
          displayName: "Ada Nowak",
          participantKind: "member",
        },
      ],
    }),
    "comment.list": result({
      kind: "comment.list",
      target: { kind: "task", taskId },
      threads: [
        {
          id: rootCommentId,
          rootCommentId,
          body: "@Kacper potwierdź wariant recovery przed zamknięciem zadania.",
          attachments: [],
          author: { principalId: memberId, displayName: "Ada Nowak" },
          mentionPrincipalIds: [ownerId],
          threadState: "open",
          version: 2,
          createdAt: "2026-07-14T10:42:00.000Z",
          updatedAt: "2026-07-14T10:45:00.000Z",
          edited: true,
        },
        // WRITTEN BY THE AGENT, and that is the whole point of this entry.
        // `buildActorResolver` (`record-actors.ts:93-111`) calls a comment an
        // agent's ONLY when its author principal is the `agentPrincipalId` of a
        // grant in `agent.access` — the author's display name is never
        // consulted. Until this harness answered that query, every comment in
        // it resolved to a person, `.entryAgent` and `.markAgent` were declared
        // in the sheet and drawn by nobody, and the two pairs reading them
        // measured nothing while looking exactly like pairs that were waiting
        // for a lot.
        //
        // The reply was flipped rather than a third thread added: one human
        // root plus one agent reply is the shape the panel is built around, and
        // the alternative changes the height of a panel that three geometry
        // registries are pinned to.
        {
          id: CommentIdSchema.parse("00000000-0000-4000-8000-000000000013"),
          parentCommentId: rootCommentId,
          rootCommentId,
          body: "Pakietowy dowód macOS i Windows jest dołączony — obie ścieżki odzyskania przeszły, log jest w załączniku do zadania.",
          attachments: [],
          author: {
            principalId: agentPrincipalId,
            displayName: "Orbit Runner",
          },
          mentionPrincipalIds: [],
          threadState: "open",
          version: 1,
          createdAt: "2026-07-14T10:51:00.000Z",
          updatedAt: "2026-07-14T10:51:00.000Z",
          edited: false,
        },
      ],
    }),
    // CZTERY EKRANY CRM CZYTAJĄ TĘ JEDNĄ PROJEKCJĘ, i do fali E nie było jej
    // tutaj wcale. `optionalProjection` połykał odmowę, Lejek, Odnowienia,
    // Relacje i Ludzie rysowały „this view's data is unavailable right now",
    // a bramka układu przechodziła na zielono nad czterema ekranami, których
    // nigdy nie zobaczyła. Materiał i powód jego kształtu: `crm-fixture.ts`.
    "relationship.workspace": result({
      kind: "relationship.workspace",
      records: crmRecords(workspaceId, spaceId),
      freshness: {
        mode: "local_authoritative",
        checkpoint: null,
        missingCapabilities: [],
      },
    }),
    "attention.inbox": result({
      kind: "attention.inbox",
      unreadCount: 1,
      items: [
        {
          id: AttentionSignalIdSchema.parse(
            "00000000-0000-4000-8000-000000000014",
          ),
          reason: "comment_mention",
          destination: { kind: "task", taskId },
          title: taskTitle,
          detail: "You were mentioned in a comment.",
          urgency: "in_app",
          state: "unread",
          version: 1,
          occurredAt: "2026-07-14T10:42:00.000Z",
        },
      ],
    }),
  },
});

export const CollaborationHarness = () => <RealApp client={client} />;
