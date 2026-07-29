import { Component, type ReactNode } from "react";

export class LazySurfaceBoundary extends Component<
  { readonly children: ReactNode; readonly label: string },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (this.state.failed) {
      return (
        // `data-surface-state` i `data-surface-action`: gwarancją jest „powierzchnia,
        // której nie da się otworzyć, ZAWSZE proponuje ponowienie" — a nie to, jakimi
        // słowami to mówi. Smoke sprawdzał to dopasowaniem polskiej treści, więc flip
        // na angielski wywaliłby test, który pilnuje czegoś prawdziwego.
        <section
          className="surface-load-state"
          data-surface-state="failed"
          role="alert"
        >
          <p className="eyebrow">{this.props.label}</p>
          <h1 id="surface-title" tabIndex={-1}>
            Could not open this part of the app
          </h1>
          <p>Nothing was changed. Refresh the app and try again.</p>
          <button
            className="secondary-button"
            data-surface-action="retry"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

export const SurfaceLoadingState = ({ label }: { readonly label: string }) => (
  <section
    className="surface-load-state"
    data-surface-state="loading"
    aria-busy="true"
    aria-live="polite"
  >
    <p className="eyebrow">{label}</p>
    <h1 id="surface-title" tabIndex={-1}>
      Opening this part of the app…
    </h1>
    <p>Loading the current workspace content.</p>
  </section>
);
