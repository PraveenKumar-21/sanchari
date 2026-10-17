import { AuthForm } from '@/features/auth/AuthForm';

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function SignupPage() {
  return <AuthForm mode="signup" />;
}
