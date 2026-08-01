import StarterKit from "@tiptap/starter-kit";

import { STRUCTURED_DOCUMENT_HEADING_LEVELS } from "@constellation/realtime-documents";

import { EntityReference } from "./document-entity-reference.js";
import {
  DocumentImage,
  DocumentTable,
  DocumentTableCell,
  DocumentTableHeader,
  DocumentTableRow,
} from "./document-nodes.js";

/**
 * Everything that contributes a NODE or a MARK to the note editor's schema —
 * one array, spread by both editors.
 *
 * The two editors carried two copies of `StarterKit.configure({…})` and their
 * own extension lists, and this repo has already paid for that: the editors
 * offered six heading levels while the validator accepted three, so a note
 * with an h4 looked correct to whoever typed it and was permanently
 * unreadable AND unwritable to every agent. Nothing caught it until the two
 * schemas were compared by hand.
 *
 * S1 fixed that one level with a shared constant. This is the same idea one
 * layer up: the editors no longer decide what the schema is, they receive it.
 * `document-schema-parity.test.ts` then holds THIS array equal to
 * `structuredDocumentSchema` — node names, mark names, and each shared node's
 * accepted attributes, which is the comparison a name-only check would have
 * missed on `heading.levels`.
 *
 * Deliberately NOT here: `Collaboration`, `Placeholder` and the inline
 * suggestion plugin. None contributes a node or a mark, and each is
 * configured per surface. Adding one would put a Yjs document into a shared
 * constant.
 *
 * It lives beside the editors, inside the lazy chunk, and must stay there. An
 * eager import of this module drags the whole tiptap/prosemirror/yjs stack —
 * ~531 kB — onto the startup path, which is exactly what the bundle gate's
 * editor markers exist to catch.
 */
export const DOCUMENT_SCHEMA_EXTENSIONS = [
  StarterKit.configure({
    undoRedo: false,
    link: { openOnClick: false },
    // Heading levels come from the content contract, not from StarterKit's
    // defaults: the validator and the editor must accept the same set, and
    // writing the list back out as a literal here would recreate exactly the
    // divergence the shared constant closes.
    heading: { levels: [...STRUCTURED_DOCUMENT_HEADING_LEVELS] },
  }),
  EntityReference,
  DocumentImage,
  DocumentTable,
  DocumentTableRow,
  DocumentTableCell,
  DocumentTableHeader,
];
