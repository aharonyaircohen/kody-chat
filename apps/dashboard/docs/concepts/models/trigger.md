# Trigger

Status: **Current Loop value; runtime support is split**

A Trigger says when a Loop becomes eligible:

```ts
type Trigger =
  | { type: "manual" }
  | { type: "schedule"; every: string; at?: { time: string; timezone: string } }
  | { type: "event"; event: string }
  | { type: "webhook"; event: string }
  | { type: "condition"; expression: string };
```

The Dashboard accepts all five types. The published Engine's older Loop system
executes manual and schedule only. It does not read the Dashboard's simple Loop
files. Therefore none of these Dashboard triggers is integrated end to end yet.

Trigger creates eligibility; it never grants permission or records history.
