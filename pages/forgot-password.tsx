import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link } from 'wouter';
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
import { useForgotPassword } from '@workspace/api-client-react';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const forgotPasswordMutation = useForgotPassword();

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = (data: ForgotPasswordValues) => {
    forgotPasswordMutation.mutate({ data }, {
      onSuccess: () => {
        toast.success("If an account exists, a reset link has been sent.");
      },
      onError: () => {
        toast.error("Failed to process request");
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="max-w-md w-full">
        <div className="mb-6">
          <Link href="/login">
            <span className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer" data-testid="link-back-login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </span>
          </Link>
        </div>

        <div className="bg-card shadow-lg rounded-xl border border-border p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground mb-2">Reset Password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input placeholder="admin@example.com" type="email" {...field} data-testid="input-email-reset" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full" 
                size="lg" 
                disabled={forgotPasswordMutation.isPending}
                data-testid="button-submit-reset"
              >
                {forgotPasswordMutation.isPending ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
