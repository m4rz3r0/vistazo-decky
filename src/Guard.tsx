import { Component, ReactNode } from "react";

// A Steam update can rename something our screens read while rendering. Without this, the error
// reaches Steam's own boundary and the whole home or game page is replaced by an error screen;
// with it, only our part goes away and `fallback` (Steam's own content, or nothing) shows instead.
export class Guard extends Component<
  { name: string; fallback?: ReactNode; children?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error(`[Vistazo] ${this.props.name}`, error);
  }
  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
