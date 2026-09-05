import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useLogin } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/contexts/BrandingContext';
import { toast } from 'sonner';

// Permissive email regex — accepts any TLD including newer ones like .africa, .co.ke
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required')
    .refine((v) => EMAIL_RE.test(v), 'Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { branding } = useBranding();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (data: LoginFormValues) => {
    form.clearErrors();
    loginMutation.mutate(
      { data: { email: data.email, password: data.password } },
      {
        onSuccess: (response) => {
          login(response.token, response.user as Parameters<typeof login>[1]);
          toast.success(`Welcome back, ${response.user.name}!`);
          setLocation('/dashboard');
        },
        onError: (err: unknown) => {
          let message = 'Invalid email or password. Please try again.';
          if (err && typeof err === 'object') {
            const e = err as Record<string, unknown>;
            if (typeof e['message'] === 'string') message = e['message'];
            else if (e['response'] && typeof (e['response'] as Record<string, unknown>)['data'] === 'object') {
              const d = (e['response'] as Record<string, unknown>)['data'] as Record<string, unknown>;
              if (typeof d['error'] === 'string') message = d['error'];
            }
          }
          form.setError('root', { message });
          toast.error(message);
        },
      }
    );
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{
        background: 'linear-gradient(145deg, hsl(216,68%,12%) 0%, hsl(216,65%,22%) 55%, hsl(215,60%,28%) 100%)',
      }}
    >
      <div className="max-w-md w-full">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src={branding.logoUrl}
              alt={branding.name}
              className="w-24 h-24 object-contain rounded-2xl shadow-xl"
              style={{ background: 'white', padding: '6px' }}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {branding.name}
          </h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
            {branding.tagline}
          </p>
          {/* Gold accent bar */}
          <div
            className="mx-auto mt-4 h-0.5 w-24 rounded-full"
            style={{ background: 'linear-gradient(90deg,hsl(37,91%,52%),transparent)' }}
          />
        </div>

        <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl border border-white/20 p-8">
          <p className="text-center text-sm text-muted-foreground mb-6">
            Sign in to your account to continue
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
              {form.formState.errors.root && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                  {form.formState.errors.root.message}
                </div>
              )}

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="you@uniquesolarkenya.co.ke"
                        type="email"
                        autoComplete="email"
                        data-testid="input-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link href="/forgot-password">
                        <span
                          className="text-sm font-medium text-primary hover:underline cursor-pointer"
                          data-testid="link-forgot-password"
                        >
                          Forgot password?
                        </span>
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        placeholder="••••••••"
                        type="password"
                        autoComplete="current-password"
                        data-testid="input-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full h-11 font-semibold"
                size="lg"
                disabled={loginMutation.isPending}
                data-testid="button-submit-login"
                style={{ background: 'hsl(215,65%,33%)', color: 'white' }}
              >
                {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {branding.addressLine} &nbsp;·&nbsp; {branding.phone}
        </p>
      </div>
    </div>
  );
}
