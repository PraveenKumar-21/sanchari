import { Plane } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Plane className="size-5 text-primary" aria-hidden />
            Sanchari
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}
