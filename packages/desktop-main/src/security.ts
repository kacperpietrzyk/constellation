import type { IpcMainInvokeEvent } from "electron";

export const isTrustedRendererUrl = (
  rendererUrl: string,
  developmentUrl?: string,
): boolean => {
  if (developmentUrl !== undefined) {
    return (
      rendererUrl === developmentUrl ||
      rendererUrl.startsWith(`${developmentUrl}/`)
    );
  }
  return rendererUrl.startsWith("file://");
};

export const assertTrustedSender = (
  event: Pick<IpcMainInvokeEvent, "senderFrame">,
  developmentUrl?: string,
): void => {
  const url = event.senderFrame?.url;
  if (url === undefined || !isTrustedRendererUrl(url, developmentUrl)) {
    throw new Error("Rejected desktop request from an untrusted renderer.");
  }
};
