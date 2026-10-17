import { CircleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Top-level crash screen (frontend-spec §11). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center"
      >
        <CircleAlert className="size-8 text-destructive" aria-hidden />
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your trips are safe. Reload the page to continue.
        </p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}
