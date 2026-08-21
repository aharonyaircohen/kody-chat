type ToolExecutor = (input: unknown) => Promise<unknown>;

const READ_ONLY_TOOL_PREFIXES = [
  "check_",
  "describe_",
  "fetch_",
  "get_",
  "inspect_",
  "list_",
  "load_",
  "read_",
  "search_",
  "show_",
  "view_",
] as const;

const READ_ONLY_TOOL_NAMES = new Set([
  "final_answer",
  "github_list_tree",
  "github_search_code",
  "kody_get_default_branch_ci",
  "list_dashboard_features",
]);

export function isReadOnlyToolName(name: string): boolean {
  return (
    READ_ONLY_TOOL_NAMES.has(name) ||
    READ_ONLY_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/**
 * Keeps reads that follow a write in the same model step from observing the
 * state that existed before the write. Independent reads still run together.
 */
export function createToolExecutionCoordinator() {
  let mutationTail: Promise<void> = Promise.resolve();

  return {
    wrap(name: string, execute: ToolExecutor): ToolExecutor {
      if (isReadOnlyToolName(name)) {
        return async (input) => {
          await mutationTail;
          return execute(input);
        };
      }

      return (input) => {
        const previousMutation = mutationTail;
        let releaseMutation!: () => void;
        mutationTail = new Promise<void>((resolve) => {
          releaseMutation = resolve;
        });

        return previousMutation
          .then(() => execute(input))
          .finally(() => releaseMutation());
      };
    },
  };
}
