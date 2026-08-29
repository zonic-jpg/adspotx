import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { section: string; children: ReactNode }
interface State { hasError: boolean }

/** Contains a render crash to one section instead of blanking the whole SPA. */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.section}] render error`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", fontFamily: "system-ui" }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong in this section</h2>
          <p style={{ fontSize: 14, opacity: 0.7, margin: "8px 0 16px" }}>
            The rest of AdSpot is unaffected. Reload to try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
