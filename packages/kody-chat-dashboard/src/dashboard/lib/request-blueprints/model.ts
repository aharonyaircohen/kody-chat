export interface RequestBlueprintQuestion {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly explanation: string;
  readonly optional?: boolean;
  readonly inputType?: "text" | "textarea";
  readonly followUps?: readonly RequestBlueprintQuestion[];
}

export interface RequestBlueprintDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly introduction: {
    readonly title: string;
    readonly explanation: string;
  };
  readonly modelPurpose: string;
  readonly questions: readonly RequestBlueprintQuestion[];
  readonly onComplete: {
    readonly action: "agency-request.submit";
  };
}

