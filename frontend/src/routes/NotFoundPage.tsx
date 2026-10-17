import { Link } from 'react-router';
import { CenteredLayout } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/button';
import { useMe } from '@/features/auth/queries';

/** frontend-spec §4.7 */
export function NotFoundPage() {
  const { data: user } = useMe();
  return (
    <CenteredLayout>
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">We couldn't find that page</h1>
        <Button asChild>
          <Link to={user ? '/trips' : '/login'}>{user ? 'Back to my trips' : 'Go to login'}</Link>
        </Button>
      </div>
    </CenteredLayout>
  );
}
