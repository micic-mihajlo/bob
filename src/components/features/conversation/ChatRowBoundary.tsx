"use client";

import { Component, type ReactNode } from "react";

/** A chat row that fails to draw shows a short notice, so the rest of the transcript stays usable. */
export class ChatRowBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <p className="chat-row-unavailable">This message could not be shown</p> : this.props.children;
  }
}
