import type { GuidedFlowDefinition } from "../guided-flows/model";
import type {
  RequestBlueprintDefinition,
  RequestBlueprintQuestion,
} from "./model";

export type {
  RequestBlueprintDefinition,
  RequestBlueprintQuestion,
} from "./model";

function flattenQuestions(
  questions: readonly RequestBlueprintQuestion[],
): RequestBlueprintQuestion[] {
  return questions.flatMap((question) => [
    question,
    ...flattenQuestions(question.followUps ?? []),
  ]);
}

function validateRequestBlueprint(
  definition: RequestBlueprintDefinition,
): RequestBlueprintQuestion[] {
  if (!definition.id.trim()) throw new Error("Request Blueprint id is required");
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new Error("Request Blueprint version must be a positive integer");
  }

  const questions = flattenQuestions(definition.questions);
  if (questions.length === 0) {
    throw new Error("Request Blueprint must define at least one question");
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  for (const question of questions) {
    if (!question.id.trim()) throw new Error("Request Blueprint question id is required");
    if (!question.name.trim()) {
      throw new Error("Request Blueprint answer name is required");
    }
    if (ids.has(question.id)) {
      throw new Error(`Duplicate question id "${question.id}"`);
    }
    if (names.has(question.name)) {
      throw new Error(`Duplicate answer name "${question.name}"`);
    }
    ids.add(question.id);
    names.add(question.name);
  }
  return questions;
}

export function buildGuidedFlowFromRequestBlueprint(
  definition: RequestBlueprintDefinition,
): GuidedFlowDefinition {
  const questions = validateRequestBlueprint(definition);

  return {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    controls: ["back"],
    onComplete: definition.onComplete,
    steps: [
      {
        id: "introduction",
        title: definition.introduction.title,
        explanation: definition.introduction.explanation,
        rendererSlug: "approval-card",
        rendererData: {
          title: definition.title,
          actions: [
            {
              id: "continue",
              label: "Begin",
              response: "continue",
              variant: "primary",
            },
          ],
        },
        actions: [
          {
            id: "continue",
            target: { type: "step", stepId: questions[0]!.id },
          },
        ],
      },
      ...questions.map((question, index) => ({
        id: question.id,
        title: question.title,
        explanation: question.explanation,
        rendererSlug: "guided-form",
        rendererData: {
          title: `Question ${index + 1} of ${questions.length}`,
          fields: [
            {
              name: question.name,
              label: question.title,
              value: "",
              inputType: question.inputType ?? "textarea",
              ...(question.optional ? { description: "Optional" } : {}),
            },
          ],
          submitLabel:
            index === questions.length - 1 ? "Submit request" : "Continue",
        },
        actions: [
          {
            id: "submit",
            target:
              index === questions.length - 1
                ? ({ type: "complete" } as const)
                : ({
                    type: "step",
                    stepId: questions[index + 1]!.id,
                  } as const),
          },
        ],
      })),
    ],
  };
}

export function buildRequestBlueprintModelGuide(
  definition: RequestBlueprintDefinition,
): string {
  const questions = validateRequestBlueprint(definition);
  const questionGuide = questions
    .map(
      (question) =>
        `- ${question.name}: ${question.title} ${question.explanation}`,
    )
    .join("\n");

  return [
    `Purpose: ${definition.modelPurpose}`,
    "Use this Request Blueprint as the single intake contract:",
    questionGuide,
    "Inspect available repository facts before asking the user. Ask only for a missing user decision that cannot be safely inferred. Preserve the answer names when submitting the request.",
  ].join("\n");
}

