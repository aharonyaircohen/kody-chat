# Project assessment

The project assessment gives a repository owner one evidence-based view of the
project's health, maintenance needs, team capacity, and highest priorities.

## User flow

The built-in GuidedFlow id is `project-assessment`. Version 2 is current and
adds the introduction step. Version 1 remains registered so assessments that
were already in progress can still resume safely.

1. An introduction explains what Kody will inspect, what the user must answer,
   when analysis starts, and what the report contains.
2. Seven separate steps collect context that cannot be learned reliably from
   repository evidence:
   - project goals and expected growth;
   - business importance and acceptable failures;
   - active team size and roles;
   - relevant team experience;
   - shared system knowledge and ownership gaps;
   - real maintenance time available;
   - optional comments and report preferences.
3. Each submitted answer is saved by the existing GuidedFlow persistence path.
   The user can leave, resume, or go back without creating assessment-specific
   storage.
4. Assessment work starts only after the seventh answer is submitted.

## What Kody determines automatically

Kody inspects repository content and GitHub history for architecture, code
quality, tests, security, delivery, operations, scalability, maintenance risk,
team capacity, and product QA evidence. The form must not ask the user for
facts Kody can determine from that evidence.

## Assessment execution

After intake completes, Kody delegates the available `assess-*` capabilities
assigned to the built-in CTO agent, up to the platform's parallel assignment
limit. Each capability owns one assessment track. Kody then combines those
results into one project report.

The assessment creates a report and does not change product code. Any later
fixes are separate, explicit work.

## Report contract

The report should present:

1. a business and product overview for an owner, CEO, or product lead;
2. findings ranked by severity, importance, and likely impact;
3. the maintenance gap between the current team and the expected team or time;
4. where Kody can add practical value through maintenance, test coverage,
   security advice, coding-agent documentation, and continuous product QA;
5. technical evidence, architecture findings, and recommended actions after
   the non-technical section.

The report must separate verified evidence, user-provided context, inference,
and recommendation.

## Ownership

- GuidedFlow owns the introduction, questions, progress, saved answers, Back,
  and resume behavior.
- Chat starts or resumes the flow and passes the completed answers to the
  existing assessment router.
- The CTO assessment capabilities own the parallel analysis tracks.
- The report path owns the final durable assessment output.

Do not add another assessment form, renderer, storage path, or execution
system for this flow.
