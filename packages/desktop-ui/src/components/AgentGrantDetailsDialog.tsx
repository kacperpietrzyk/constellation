import { useEffect, useRef, useState } from "react";

import { Icon } from "./Icon.js";

export type AgentGrantDetails = {
  readonly title: string;
  readonly descriptorLabel: string;
  readonly descriptorPath: string;
  readonly connectionLabel: string;
  readonly connectionValue: string;
};

export const AgentGrantDetailsDialog = ({
  details,
  onClose,
}: {
  readonly details: AgentGrantDetails;
  readonly onClose: () => void;
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<string>();
  useEffect(() => {
    dialogRef.current?.showModal();
    return () => dialogRef.current?.close();
  }, []);
  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied(undefined);
    }
  };
  return (
    <dialog
      ref={dialogRef}
      className="capture-backdrop"
      aria-labelledby="agent-grant-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="capture-dialog agent-grant-dialog">
        <header className="capture-header">
          <div>
            <p className="eyebrow">MCP</p>
            <h2 id="agent-grant-title">{details.title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close access details"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        <dl className="agent-grant-details">
          <div>
            <dt>{details.descriptorLabel}</dt>
            <dd className="mono">{details.descriptorPath}</dd>
            <button
              className="secondary-button"
              onClick={() => void copy("descriptor", details.descriptorPath)}
            >
              {copied === "descriptor" ? "Copied" : "Copy"}
            </button>
          </div>
          <div>
            <dt>{details.connectionLabel}</dt>
            <dd className="mono">{details.connectionValue}</dd>
            <button
              className="secondary-button"
              onClick={() => void copy("connection", details.connectionValue)}
            >
              {copied === "connection" ? "Copied" : "Copy"}
            </button>
          </div>
        </dl>
        <footer className="capture-footer">
          <span>
            Copy these values now — the MCP host asks for them at setup.
          </span>
          <button className="primary-button" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </dialog>
  );
};
