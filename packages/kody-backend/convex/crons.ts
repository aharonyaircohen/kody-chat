import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "wake scheduled Kody Loops",
  { minutes: 1 },
  internal.loopWakes.dispatchDue,
);

export default crons;
