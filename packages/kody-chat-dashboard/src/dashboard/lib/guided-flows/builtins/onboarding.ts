import type { GuidedFlowDefinition } from "../controller";

export const ONBOARDING_FLOW_ID = "onboarding";

export const ONBOARDING_FLOW_V1: GuidedFlowDefinition = {
  id: ONBOARDING_FLOW_ID,
  version: 1,
  title: "Get started with Kody",
  completionRouteId: "chat",
  controls: ["back"],
  steps: [
    {
      id: "welcome",
      title: "Welcome to Kody",
      explanation:
        "Let's finish the three things Kody needs before your first chat.\n\n**You'll complete three quick steps:**\n\n1. Create a GitHub personal access token.\n2. Connect your first repository.\n3. Add `OPENROUTER_API_KEY`.\n\n> Complete each task, then return to Chat and select **Next**.",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Welcome to Kody",
        actions: [
          {
            id: "next",
            label: "Get started",
            response: "next",
            variant: "primary",
          },
        ],
      },
      actions: [
        {
          id: "next",
          target: {
            type: "step",
            stepId: "create-github-pat",
          },
        },
      ],
    },
    {
      id: "create-github-pat",
      title: "Create a GitHub personal access token",
      explanation:
        "Kody needs a GitHub personal access token before it can connect to your repository.\n\n**On GitHub:**\n\n1. [Create a personal access token](https://github.com/settings/tokens/new?description=Kody+Dashboard&scopes=repo,workflow,admin:repo_hook).\n2. Grant the `repo`, `workflow`, and `admin:repo_hook` scopes.\n3. Copy the token—you will paste it in the next step.\n\n> Keep the token private.\n\nReturn to Chat and select **Next**.",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Create your GitHub PAT",
        actions: [
          {
            id: "next",
            label: "Next",
            response: "next",
            variant: "primary",
          },
        ],
      },
      actions: [
        {
          id: "next",
          target: { type: "step", stepId: "connect-repository" },
        },
      ],
    },
    {
      id: "connect-repository",
      title: "Connect your first repository",
      explanation:
        "Use the GitHub PAT you just created to connect your first repository.\n\n**On the Org page:**\n\n1. Enter the repository URL or `owner/repo`.\n2. Paste your personal access token.\n3. Select **Connect repository**.\n\nReturn to Chat and select **Next**.",
      routeId: "org",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Connect your first repository",
        actions: [
          {
            id: "next",
            label: "Next",
            response: "next",
            variant: "primary",
          },
        ],
      },
      actions: [
        {
          id: "next",
          target: { type: "step", stepId: "add-openrouter-key" },
        },
      ],
    },
    {
      id: "add-openrouter-key",
      title: "Add your OpenRouter key",
      explanation:
        "The built-in OpenRouter Free model becomes available after its API key is saved.\n\n**On the Secrets page:**\n\n1. Add a secret named `OPENROUTER_API_KEY`.\n2. Paste your OpenRouter API key as the value.\n3. Save the secret.\n\nReturn to Chat and select **Next**.",
      routeId: "secrets",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Activate built-in Chat",
        actions: [
          {
            id: "next",
            label: "Next",
            response: "next",
            variant: "primary",
          },
        ],
      },
      actions: [{ id: "next", target: { type: "step", stepId: "ready" } }],
    },
    {
      id: "ready",
      title: "Setup steps complete",
      explanation:
        "Kody now has repository access and a Chat model.\n\n**You're ready.**\n\nSelect **Finish** to open Chat, then send your first message.",
      rendererSlug: "approval-card",
      rendererData: {
        title: "You are ready to try Chat",
        actions: [
          {
            id: "finish",
            label: "Finish",
            response: "finish",
            variant: "primary",
          },
        ],
      },
      actions: [{ id: "finish", target: { type: "complete" } }],
    },
  ],
};

export const ONBOARDING_FLOW: GuidedFlowDefinition = {
  id: ONBOARDING_FLOW_ID,
  version: 2,
  title: "Get started with Kody",
  completionRouteId: "chat",
  controls: ["back"],
  steps: [
    {
      id: "welcome",
      title: "Your private Chat is ready",
      explanation:
        "Your Chat belongs to you and works without a repository. Its history stays with you when you attach or switch repositories.\n\nChoose **Start chatting** now, or attach a repository to add repository pages, tools, and Agency.",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Your private Chat is ready",
        actions: [
          {
            id: "finish",
            label: "Start chatting",
            response: "finish",
            variant: "primary",
          },
          {
            id: "repository",
            label: "Attach a repository",
            response: "repository",
            variant: "secondary",
          },
        ],
      },
      actions: [
        { id: "finish", target: { type: "complete" } },
        {
          id: "repository",
          target: { type: "step", stepId: "attach-repository" },
        },
      ],
    },
    {
      id: "attach-repository",
      title: "Add repository tools",
      explanation:
        "Attach a repository from the repository switcher. This adds repository context, pages, tools, and Agency to the same Chat; it does not create a separate Chat or replace your history.\n\nWhen the repository is connected, return to Chat and select **Finish**.",
      routeId: "org",
      rendererSlug: "approval-card",
      rendererData: {
        title: "Attach a repository when you need one",
        actions: [
          {
            id: "finish",
            label: "Finish",
            response: "finish",
            variant: "primary",
          },
        ],
      },
      actions: [{ id: "finish", target: { type: "complete" } }],
    },
  ],
};
