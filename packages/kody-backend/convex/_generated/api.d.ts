/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actionStates from "../actionStates.js";
import type * as agencyRecords from "../agencyRecords.js";
import type * as agencyRuns from "../agencyRuns.js";
import type * as agents from "../agents.js";
import type * as capabilityState from "../capabilityState.js";
import type * as catalog from "../catalog.js";
import type * as channelsSeen from "../channelsSeen.js";
import type * as chatEvents from "../chatEvents.js";
import type * as conversationTurns from "../conversationTurns.js";
import type * as conversationValidators from "../conversationValidators.js";
import type * as conversations from "../conversations.js";
import type * as dailyLogs from "../dailyLogs.js";
import type * as definitionProposals from "../definitionProposals.js";
import type * as definitions from "../definitions.js";
import type * as eventLog from "../eventLog.js";
import type * as goals from "../goals.js";
import type * as guidedFlows from "../guidedFlows.js";
import type * as importExport from "../importExport.js";
import type * as inbox from "../inbox.js";
import type * as intents from "../intents.js";
import type * as lib_auth from "../lib/auth.js";
import type * as macros from "../macros.js";
import type * as manifests from "../manifests.js";
import type * as notificationPrefs from "../notificationPrefs.js";
import type * as repoDocs from "../repoDocs.js";
import type * as reports from "../reports.js";
import type * as runEvents from "../runEvents.js";
import type * as taskState from "../taskState.js";
import type * as userJourneys from "../userJourneys.js";
import type * as userPreferences from "../userPreferences.js";
import type * as userState from "../userState.js";
import type * as validators from "../validators.js";
import type * as viewRenderers from "../viewRenderers.js";
import type * as widgets from "../widgets.js";
import type * as workflowRuns from "../workflowRuns.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  actionStates: typeof actionStates;
  agencyRecords: typeof agencyRecords;
  agencyRuns: typeof agencyRuns;
  agents: typeof agents;
  capabilityState: typeof capabilityState;
  catalog: typeof catalog;
  channelsSeen: typeof channelsSeen;
  chatEvents: typeof chatEvents;
  conversationTurns: typeof conversationTurns;
  conversationValidators: typeof conversationValidators;
  conversations: typeof conversations;
  dailyLogs: typeof dailyLogs;
  definitionProposals: typeof definitionProposals;
  definitions: typeof definitions;
  eventLog: typeof eventLog;
  goals: typeof goals;
  guidedFlows: typeof guidedFlows;
  importExport: typeof importExport;
  inbox: typeof inbox;
  intents: typeof intents;
  "lib/auth": typeof lib_auth;
  macros: typeof macros;
  manifests: typeof manifests;
  notificationPrefs: typeof notificationPrefs;
  repoDocs: typeof repoDocs;
  reports: typeof reports;
  runEvents: typeof runEvents;
  taskState: typeof taskState;
  userJourneys: typeof userJourneys;
  userPreferences: typeof userPreferences;
  userState: typeof userState;
  validators: typeof validators;
  viewRenderers: typeof viewRenderers;
  widgets: typeof widgets;
  workflowRuns: typeof workflowRuns;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
