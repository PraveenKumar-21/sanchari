import { CircleUser, LogOut, Plane } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout, useMe } from '@/features/auth/queries';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold">
      <Plane className="size-5 text-primary" aria-hidden />
      Sanchari
    </Link>
  );
}

function UserMenu() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <CircleUser className="size-4" aria-hidden />
          <span className="max-w-40 truncate">{user.username}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate">{user.username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
        >
          <LogOut aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Header + page container for signed-in pages (frontend-spec §5). */
export function AppShell() {
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 md:px-6">
          <Logo />
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}

/** Centered layout for Login, Sign Up and Not Found. */
export function CenteredLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center gap-8 px-4 py-12 sm:justify-center">
      <Logo />
      {children ?? <Outlet />}
    </div>
  );
}
