import { Badge, Button, Card, Input } from "@/components/design-system";

import { loginAction } from "@/lib/auth/actions";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const errorMessages: Record<string, string> = {
  auth_unconfigured: "Authentication is not configured yet. Check the Supabase environment before signing in.",
  invalid_credentials: "Invalid credentials.",
  not_allowlisted: "This account is not allowlisted for CreatorOS Personal.",
  unauthenticated: "Sign in to continue.",
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = firstParam(params?.error);
  const notice = firstParam(params?.notice);
  const message = error ? errorMessages[error] ?? errorMessages.invalid_credentials : null;

  return (
    <main className="login-page">
      <Card className="login-card" variant="default">
        <Card.Header>
          <div className="login-brand" aria-label="CreatorOS Personal">
            <span className="login-brand-name smallcaps">CreatorOS</span>
            <span className="login-brand-folio mono">Ⅰ</span>
          </div>
        </Card.Header>
        <Card.Body>
          <h1 className="login-title">CreatorOS Personal</h1>
          <p className="login-copy">Private workspace.</p>
          {message ? (
            <p className="login-alert" role="alert">
              {message}
            </p>
          ) : null}
          {notice === "logged_out" ? <p className="login-note">Signed out.</p> : null}
          <form action={loginAction} aria-describedby="login-private-note" className="login-form">
            <Input autoComplete="email" label="Email" name="email" required type="email" />
            <Input autoComplete="current-password" label="Password" name="password" required type="password" />
            <Button type="submit" variant="primary">
              Sign in
            </Button>
          </form>
          <Badge variant="outline">admin allowlist required</Badge>
          <p className="login-note" id="login-private-note">
            Use the private admin account configured in ADMIN_EMAILS. Public onboarding is not available.
          </p>
        </Card.Body>
      </Card>
    </main>
  );
}
