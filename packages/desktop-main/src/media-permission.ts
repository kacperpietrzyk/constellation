export interface MediaPermissionCheckInput {
  readonly permission: string;
  readonly requestingOrigin: string;
  readonly webContentsUrl?: string;
  readonly details: {
    readonly embeddingOrigin?: string;
    readonly isMainFrame: boolean;
    readonly mediaType?: "video" | "audio" | "unknown";
    readonly requestingUrl?: string;
    readonly securityOrigin?: string;
  };
}

export interface MediaPermissionRequestInput {
  readonly permission: string;
  readonly webContentsUrl: string;
  readonly details: {
    readonly isMainFrame: boolean;
    readonly mediaTypes?: readonly ("video" | "audio")[];
    readonly requestingUrl: string;
    readonly securityOrigin?: string;
  };
}

const everyDeclaredOriginIsTrusted = (
  urls: readonly (string | undefined)[],
  isTrustedRendererUrl: (url: string) => boolean,
): boolean =>
  urls.every((url) => url === undefined || isTrustedRendererUrl(url));

export const allowsAudioMediaCheck = (
  input: MediaPermissionCheckInput,
  isTrustedRendererUrl: (url: string) => boolean,
): boolean =>
  input.permission === "media" &&
  input.details.isMainFrame &&
  input.details.embeddingOrigin === undefined &&
  input.details.mediaType === "audio" &&
  input.webContentsUrl !== undefined &&
  everyDeclaredOriginIsTrusted(
    [
      input.webContentsUrl,
      input.requestingOrigin,
      input.details.requestingUrl,
      input.details.securityOrigin,
    ],
    isTrustedRendererUrl,
  );

export const allowsAudioMediaRequest = (
  input: MediaPermissionRequestInput,
  isTrustedRendererUrl: (url: string) => boolean,
): boolean =>
  input.permission === "media" &&
  input.details.isMainFrame &&
  input.details.mediaTypes?.length === 1 &&
  input.details.mediaTypes[0] === "audio" &&
  everyDeclaredOriginIsTrusted(
    [
      input.webContentsUrl,
      input.details.requestingUrl,
      input.details.securityOrigin,
    ],
    isTrustedRendererUrl,
  );
