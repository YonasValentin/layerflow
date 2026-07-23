import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  readonly onError: (error: unknown) => void;
  readonly children: ReactNode;
}

interface State {
  readonly failed: boolean;
}

export class PresentationErrorBoundary extends Component<Props, State> {
  public override state: State = { failed: false };

  public static getDerivedStateFromError(): State {
    return { failed: true };
  }

  public override componentDidCatch(error: unknown, _info: ErrorInfo): void {
    this.props.onError(error);
  }

  public override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
