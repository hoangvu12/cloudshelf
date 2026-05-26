import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Lock } from "@/lib/icons";

import { FormCard } from "@/components/form-section";
import { StatusAlert } from "@/components/status-alert";
import { PasswordInput } from "@/components/password-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useLogin, useMe } from "@/lib/api/auth";
import { ApiClientError } from "@/lib/api/client";

const schema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const me = useMe();

  React.useEffect(() => {
    if (me.data) navigate({ to: "/" });
  }, [me.data, navigate]);

  const [error, setError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await login.mutateAsync(values);
      navigate({ to: "/" });
    } catch (err) {
      if (err instanceof ApiClientError) setError(err.message);
      else setError(err instanceof Error ? err.message : "Login failed");
    }
  });

  const isBusy = login.isPending;

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="bg-primary text-primary-foreground mb-4 flex size-9 items-center justify-center rounded-lg font-mono text-sm font-bold">
            C
          </div>
          <h1 className="text-foreground text-xl font-medium tracking-tight">
            Sign in to <strong className="font-semibold">CloudShelf</strong>
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Enter the credentials configured for this server.
          </p>
        </div>

        <FormCard className="p-6 sm:p-6">
          <form onSubmit={onSubmit} className="space-y-5">
            <Field
              label="Username"
              htmlFor="username"
              error={errors.username?.message}
            >
              <Input
                id="username"
                autoComplete="username"
                autoFocus
                spellCheck={false}
                {...register("username")}
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              error={errors.password?.message}
            >
              <PasswordInput
                id="password"
                autoComplete="current-password"
                {...register("password")}
              />
            </Field>

            {error && (
              <StatusAlert
                variant="error"
                title="Sign-in failed"
                description={error}
              />
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isBusy}
            >
              {isBusy ? (
                <>
                  <Loader2 className="size-5 animate-spin" strokeWidth={2} />
                  Signing in…
                </>
              ) : (
                <>
                  <Lock className="size-4" strokeWidth={1.5} />
                  Sign in
                </>
              )}
            </Button>
          </form>
        </FormCard>

        <p className="text-muted-foreground/70 mt-6 text-center text-xs">
          Credentials come from{" "}
          <code className="text-muted-foreground font-mono">
            CLOUDSHELF_USERNAME
          </code>{" "}
          and{" "}
          <code className="text-muted-foreground font-mono">
            CLOUDSHELF_PASSWORD
          </code>
          .
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p className="text-destructive ml-1 text-xs font-medium">{error}</p>
      )}
    </div>
  );
}
