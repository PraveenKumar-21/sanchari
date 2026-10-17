import { zodResolver } from '@hookform/resolvers/zod';
import { loginInputSchema, passwordSchema, usernameSchema } from '@sanchari/shared';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/layout/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api/client';
import { applyValidationErrors } from '@/lib/form-errors';
import { useLogin, useSignup } from './queries';
import { safeReturnTo } from '@/lib/return-to';

const signupFormSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

const loginFormSchema = loginInputSchema.extend({ confirmPassword: z.string().optional() });

type FormInput = z.input<typeof signupFormSchema>;

const FIELDS = new Set(['username', 'password']);

/** Login and Sign Up (frontend-spec §4.1, §4.2). */
export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();
  const signup = useSignup();
  const mutation = isSignup ? signup : login;

  const form = useForm<FormInput>({
    resolver: zodResolver(isSignup ? signupFormSchema : loginFormSchema),
    mode: 'onTouched',
    defaultValues: { username: '', password: '', confirmPassword: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async ({ username, password }) => {
    try {
      await mutation.mutateAsync({ username, password });
      navigate(safeReturnTo(params.get('returnTo')), { replace: true });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.code === 'USERNAME_TAKEN') {
        form.setError('username', { message: 'Username is already taken' });
      } else if (err.code === 'INVALID_CREDENTIALS') {
        form.setError('root', { message: 'Incorrect username or password' });
      } else if (err.code === 'RATE_LIMITED') {
        toast.error(`Too many attempts, try again in ${err.retryAfterSeconds ?? 60} seconds`);
      } else if (!applyValidationErrors(err, form.setError, (p) => FIELDS.has(p))) {
        toast.error(err.message);
      }
    }
  });

  const passwordType = showPassword ? 'text' : 'password';

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">{isSignup ? 'Create your account' : 'Log in'}</CardTitle>
        <CardDescription>
          {isSignup ? 'Plan your trips day by day.' : 'Welcome back to Sanchari.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {errors.root && (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errors.root.message}
            </p>
          )}

          <FormField
            id="username"
            label="Username"
            error={errors.username?.message}
            hint={isSignup ? '3–30 characters: letters, digits, _ . -' : undefined}
          >
            {(aria) => (
              <Input
                {...aria}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                {...form.register('username')}
              />
            )}
          </FormField>

          <FormField
            id="password"
            label="Password"
            error={errors.password?.message}
            hint={isSignup ? 'At least 8 characters' : undefined}
          >
            {(aria) => (
              <div className="relative">
                <Input
                  {...aria}
                  type={passwordType}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  className="pr-10"
                  {...form.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            )}
          </FormField>

          {isSignup && (
            <FormField
              id="confirmPassword"
              label="Confirm password"
              error={errors.confirmPassword?.message}
            >
              {(aria) => (
                <Input
                  {...aria}
                  type={passwordType}
                  autoComplete="new-password"
                  {...form.register('confirmPassword')}
                />
              )}
            </FormField>
          )}

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {isSignup ? 'Create account' : 'Log in'}
          </Button>

          {isSignup && (
            <p className="text-xs text-muted-foreground">
              Note: there's no password recovery in this version, so keep your password safe.
            </p>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {isSignup ? 'Already have an account? ' : 'New to Sanchari? '}
            <Link
              to={{ pathname: isSignup ? '/login' : '/signup', search: params.toString() }}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {isSignup ? 'Log in' : 'Sign up'}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
