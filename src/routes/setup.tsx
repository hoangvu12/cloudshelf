import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Lock } from "lucide-react";

import {
  FormCard,
  FormDivider,
  FormGroup,
  FormToggleRow,
} from "@/components/form-section";
import { StatusAlert } from "@/components/status-alert";
import { PasswordInput } from "@/components/password-input";
import { Callout } from "@/components/callout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  useCreateConnection,
  useTestConnection,
} from "@/lib/api/connections";
import { useActiveConnectionStore } from "@/stores/active-connection";

const TELEGRAM_S3_DEFAULT_ENDPOINT = "http://localhost:9000";

const schema = z.object({
  name: z.string().trim().min(1, "Profile name is required"),
  endpoint: z
    .string()
    .trim()
    .min(1, "Endpoint is required")
    .url("Must be a valid URL"),
  accessKeyId: z.string().trim().min(1, "Access key is required"),
  secretAccessKey: z.string().min(1, "Secret key is required"),
  region: z.string().trim().min(1, "Region is required"),
  forcePathStyle: z.boolean(),
  forceSSL: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

type Status =
  | { state: "idle" }
  | { state: "busy" }
  | { state: "success"; bucketCount: number }
  | { state: "error"; message: string };

export const Route = createFileRoute("/setup")({
  component: SetupPage,
});

function SetupPage() {
  const navigate = useNavigate();
  const setActive = useActiveConnectionStore((s) => s.setActive);
  const testConnection = useTestConnection();
  const createConnection = useCreateConnection();

  const [status, setStatus] = React.useState<Status>({ state: "idle" });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      endpoint: "",
      accessKeyId: "",
      secretAccessKey: "",
      region: "us-east-1",
      forcePathStyle: true,
      forceSSL: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setStatus({ state: "busy" });

    const test = await testConnection.mutateAsync(values).catch((err) => ({
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
    }));

    if (!test.ok) {
      setStatus({
        state: "error",
        message: test.error ?? "Connection failed",
      });
      return;
    }

    try {
      const created = await createConnection.mutateAsync(values);
      setActive(created.id);
      setStatus({ state: "success", bucketCount: test.bucketCount ?? 0 });
      window.setTimeout(() => {
        navigate({ to: "/" });
      }, 900);
    } catch (err) {
      setStatus({
        state: "error",
        message:
          err instanceof Error
            ? `Saved test passed but profile couldn't be stored: ${err.message}`
            : "Profile could not be stored.",
      });
    }
  });

  const fillDefault = () => {
    setValue("endpoint", TELEGRAM_S3_DEFAULT_ENDPOINT, {
      shouldValidate: true,
      shouldDirty: true,
    });
    if (!getValues("name")) {
      setValue("name", "Local telegram-s3", { shouldValidate: true });
    }
  };

  const isBusy = status.state === "busy";

  return (
    <div className="bg-background text-foreground min-h-screen">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-6 sm:px-6">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          Back to buckets
        </Link>
        <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md font-mono text-xs font-bold">
          C
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 px-4 pt-16 pb-24 sm:px-6 md:grid-cols-12 lg:gap-16">
        <aside className="flex h-fit flex-col gap-6 md:sticky md:top-16 md:col-span-4">
          <div>
            <h1 className="text-muted-foreground mb-4 text-2xl font-normal tracking-tight sm:text-3xl">
              Connect to{" "}
              <strong className="text-foreground font-medium">
                CloudShelf
              </strong>
              .
            </h1>
            <div className="text-muted-foreground space-y-4 text-sm leading-relaxed">
              <p>
                Link your S3-compatible storage endpoint to start managing your
                files.
              </p>
              <p>
                We support standard AWS S3, MinIO, R2, and local tools like
                telegram-s3.
              </p>
            </div>
          </div>

          <Callout icon={<Lock strokeWidth={1.5} className="size-4" />}>
            Credentials are stored in the CloudShelf server's SQLite database
            on this machine — not in your browser. Treat this app as local-use
            only and don't expose it to the public internet.
          </Callout>
        </aside>

        <section className="md:col-span-8">
          <FormCard>
            <form onSubmit={onSubmit} className="space-y-8">
              <div className="space-y-4">
                <Field
                  label="Profile name"
                  htmlFor="name"
                  error={errors.name?.message}
                >
                  <Input
                    id="name"
                    autoComplete="off"
                    placeholder="e.g. My telegram-s3"
                    {...register("name")}
                  />
                </Field>
              </div>

              <FormDivider />

              <div className="space-y-4">
                <Field
                  label="Endpoint URL"
                  htmlFor="endpoint"
                  error={errors.endpoint?.message}
                  trailing={
                    <Button
                      type="button"
                      variant="subtle"
                      size="xs"
                      onClick={fillDefault}
                    >
                      Fill default
                    </Button>
                  }
                >
                  <Input
                    id="endpoint"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="https://s3.amazonaws.com"
                    className="font-mono"
                    {...register("endpoint")}
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label="Access key ID"
                    htmlFor="accessKeyId"
                    error={errors.accessKeyId?.message}
                  >
                    <Input
                      id="accessKeyId"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="AKIA…"
                      className="font-mono"
                      {...register("accessKeyId")}
                    />
                  </Field>
                  <Field
                    label="Secret access key"
                    htmlFor="secretAccessKey"
                    error={errors.secretAccessKey?.message}
                  >
                    <PasswordInput
                      id="secretAccessKey"
                      autoComplete="off"
                      placeholder="••••••••••••••••"
                      {...register("secretAccessKey")}
                    />
                  </Field>
                </div>
              </div>

              <FormGroup>
                <Field
                  label="Region"
                  htmlFor="region"
                  error={errors.region?.message}
                >
                  <Input
                    id="region"
                    className="bg-card font-mono sm:w-1/2"
                    {...register("region")}
                  />
                </Field>

                <div className="bg-border h-px w-full" />

                <Controller
                  control={control}
                  name="forcePathStyle"
                  render={({ field }) => (
                    <FormToggleRow
                      title="Path-style addressing"
                      description="Recommended for telegram-s3, MinIO, and local testing."
                      control={
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      }
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="forceSSL"
                  render={({ field }) => (
                    <FormToggleRow
                      title="Force SSL"
                      description="Auto-rewrite http:// to https://."
                      control={
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      }
                    />
                  )}
                />
              </FormGroup>

              <div className="flex flex-col gap-4 pt-2">
                {status.state === "success" && (
                  <StatusAlert
                    variant="success"
                    title="Connection successful"
                    description={`Connected — found ${status.bucketCount} bucket${status.bucketCount === 1 ? "" : "s"}. Taking you to your storage…`}
                  />
                )}
                {status.state === "error" && (
                  <StatusAlert
                    variant="error"
                    title="Connection failed"
                    description={status.message}
                  />
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={isBusy || status.state === "success"}
                >
                  {isBusy && (
                    <Loader2 className="size-5 animate-spin" strokeWidth={2} />
                  )}
                  {isBusy
                    ? "Connecting…"
                    : status.state === "success"
                    ? "Connected"
                    : status.state === "error"
                    ? "Try again"
                    : "Connect"}
                </Button>
              </div>
            </form>
          </FormCard>
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  trailing,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="mr-1 flex items-baseline justify-between">
        <Label htmlFor={htmlFor}>{label}</Label>
        {trailing}
      </div>
      {children}
      {error && (
        <p className="text-destructive ml-1 text-xs font-medium">{error}</p>
      )}
    </div>
  );
}
