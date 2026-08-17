"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@kody-ade/base/ui/button";
import { kodyAuthClient } from "./auth/kody-auth-client";

function KodySignIn() {
  const testAuthEnabled = process.env.NEXT_PUBLIC_KODY_TEST_AUTH_ENABLED === "true";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("Kody QA");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);

  const signIn = (provider: "google" | "github") => {
    void kodyAuthClient.signIn.social({
      provider,
      callbackURL: "/chat",
    });
  };

  const submitTestLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const result =
      mode === "sign-in"
        ? await kodyAuthClient.signIn.email({ email, password, callbackURL: "/chat" })
        : await kodyAuthClient.signUp.email({
            email,
            password,
            name,
            callbackURL: "/chat",
          });
    if (result.error) setError("Email login failed. Check the email and password.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Sign in to Kody</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start chatting now. Connect a repository only when you need repository
          features.
        </p>
        <div className="mt-6 grid gap-3">
          <Button onClick={() => signIn("google")}>Continue with Google</Button>
          <Button variant="outline" onClick={() => signIn("github")}>
            Continue with GitHub
          </Button>
          {testAuthEnabled ? (
            <form className="mt-3 grid gap-3 border-t pt-4" onSubmit={submitTestLogin}>
              {mode === "sign-up" ? (
                <input
                  aria-label="Name"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name"
                  required
                />
              ) : null}
              <input
                aria-label="Email"
                className="rounded-md border bg-background px-3 py-2 text-sm"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="QA email"
                required
              />
              <input
                aria-label="Password"
                className="rounded-md border bg-background px-3 py-2 text-sm"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="QA password"
                minLength={8}
                required
              />
              <Button type="submit">Continue with email</Button>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => {
                  setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
                  setError(null);
                }}
              >
                {mode === "sign-in" ? "Create an account" : "Use an existing account"}
              </button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export function AuthGuard({
  children,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { data: session, isPending } = kodyAuthClient.useSession();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <KodySignIn />;
  return <>{children}</>;
}
