import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "wake scheduled Kody Loops",
  { minutes: 5 },
  internal.loopWakes.dispatchDue,
);

export default crons;
