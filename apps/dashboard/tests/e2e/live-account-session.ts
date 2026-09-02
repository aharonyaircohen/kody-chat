import { createUserOctokit } from "@kody-ade/base/github/core";
import { listVariables, readVariables } from "@kody-ade/base/variables/store";
import { readVault } from "@kody-ade/base/vault/store";

type LiveAccountEnvironment = Record<string, string | undefined>;

type LiveAccountCredentials = {
  email: string;
  password: string;
};

type LiveAccountResponse = {
  ok(): boolean;
  status(): number;
  json?(): Promise<unknown>;
};

type LiveAccountRequest = {
  post(
    url: string,
    options: {
      data: Record<string, string>;
      headers: Record<string, string>;
    },
  ): Promise<LiveAccountResponse>;
  get(url: string): Promise<LiveAccountResponse>;
};

export function readLiveKodyAccountCredentials(
  environment: LiveAccountEnvironment,
): LiveAccountCredentials {
  const email = environment.E2E_KODY_EMAIL?.trim() ?? "";
  const password = environment.E2E_KODY_PASSWORD ?? "";
  if (!email || !password) {
    throw new Error("Kody Quality requires a configured test account");
  }
  return { email, password };
}

function parseRepository(value: string): { owner: string; repo: string } {
  const pathname = new URL(value).pathname.replace(/^\/+|\/+$/g, "");
  const [owner = "", rawRepo = ""] = pathname.split("/");
  const repo = rawRepo.replace(/\.git$/i, "");
  if (!owner || !repo) {
    throw new Error("Kody Quality test-account repository is invalid");
  }
  return { owner, repo };
}

export async function loadLiveKodyAccountCredentials(
  environment: LiveAccountEnvironment,
): Promise<LiveAccountCredentials> {
  if (environment.E2E_KODY_EMAIL && environment.E2E_KODY_PASSWORD) {
    return readLiveKodyAccountCredentials(environment);
  }

  const repositoryUrl = environment.E2E_GITHUB_REPO?.trim() ?? "";
  const token = environment.E2E_GITHUB_TOKEN ?? "";
  if (!repositoryUrl || !token) {
    throw new Error("Kody Quality requires a configured test account");
  }
  const { owner, repo } = parseRepository(repositoryUrl);
  const [variables, vault] = await Promise.all([
    readVariables(owner, repo, { force: true }),
    readVault(createUserOctokit(token), owner, repo, { force: true }),
  ]);
  const email = listVariables(variables.doc).find(
    (item) => item.name === "LOGIN_USER",
  )?.value;
  const password = vault.doc.secrets.LOGIN_PASSWORD?.value;
  if (!email || !password) {
    throw new Error("Kody Quality requires a configured test account");
  }
  return { email, password };
}

export async function establishLiveKodyAccountSession(
  request: LiveAccountRequest,
  baseUrl: string,
  credentials: LiveAccountCredentials,
): Promise<void> {
  const origin = new URL(baseUrl).origin;
  const signIn = await request.post(`${baseUrl}/api/auth/sign-in/email`, {
    data: {
      email: credentials.email,
      password: credentials.password,
      callbackURL: "/chat",
    },
    headers: { Origin: origin },
  });
  if (!signIn.ok()) {
    throw new Error(`Kody account sign-in failed (${signIn.status()})`);
  }

  const session = await request.get(`${baseUrl}/api/auth/get-session`);
  const body = session.json ? await session.json().catch(() => null) : null;
  if (!session.ok() || body === null) {
    throw new Error(
      `Kody account session was not established (${session.status()})`,
    );
  }
}
