/**
 * @fileType component
 * @domain kody
 * @pattern goal-grouped-view
 * @ai-summary Goal-first task list. Groups tasks by their `goal:<id>` label
 *   into collapsible goal sections (with progress + actions) and a final
 *   "Ungrouped" bucket for tasks without any goal label. Wraps the existing
 *   TaskList per section so row behavior stays identical.
 */
'use client'

import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flag,
  Inbox,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@dashboard/ui/button'
import { cn } from '../utils'
import type { KodyTask } from '../types'
import type { Goal } from '../api'
import { GOAL_LABEL_PREFIX } from '../goals'
import { TaskList } from './TaskList'

interface GoalGroupedViewProps {
  goals: Goal[]
  tasks: KodyTask[]
  selectedTask?: KodyTask | null
  executingTaskId?: string | null
  mergingTaskId?: string | null
  focusedIndex?: number
  onTaskSelect?: (task: KodyTask | null) => void
  onExecuteTask?: (taskId: string) => void
  onStopTask?: (task: KodyTask) => void
  onApproveReview?: (task: KodyTask) => Promise<void>
  onTaskHover?: (task: KodyTask) => void
  onAssign?: (issueNumber: number, assignees: string[]) => void
  onUnassign?: (issueNumber: number, assignees: string[]) => void
  collaborators?: { login: string; avatar_url: string }[]
  onOpenPreview?: (task: KodyTask) => void
  onCreateTask?: () => void
  onEditTask?: (task: KodyTask) => void
  onDuplicate?: (task: KodyTask) => void
  onRerun?: (task: KodyTask) => void
  onToggleQueue?: (task: KodyTask) => void
  onCreateGoal?: () => void
  onEditGoal?: (goal: Goal) => void
  onDeleteGoal?: (goal: Goal) => void
  onAttachTasks?: (goal: Goal) => void
}

interface Group {
  key: string
  goal: Goal | null
  tasks: KodyTask[]
  done: number
}

function buildGroups(goals: Goal[], tasks: KodyTask[]): Group[] {
  const byGoal = new Map<string, KodyTask[]>()
  const ungrouped: KodyTask[] = []

  for (const task of tasks) {
    const goalLabels = task.labels.filter((l) => l.startsWith(GOAL_LABEL_PREFIX))
    if (goalLabels.length === 0) {
      ungrouped.push(task)
      continue
    }
    for (const label of goalLabels) {
      const id = label.slice(GOAL_LABEL_PREFIX.length)
      const bucket = byGoal.get(id) ?? []
      bucket.push(task)
      byGoal.set(id, bucket)
    }
  }

  const goalGroups: Group[] = goals.map((goal) => {
    const attached = byGoal.get(goal.id) ?? []
    const done = attached.filter(
      (t) => t.state === 'closed' || t.column === 'done',
    ).length
    return { key: `goal:${goal.id}`, goal, tasks: attached, done }
  })

  const ungroupedDone = ungrouped.filter(
    (t) => t.state === 'closed' || t.column === 'done',
  ).length

  return [
    ...goalGroups,
    {
      key: 'ungrouped',
      goal: null,
      tasks: ungrouped,
      done: ungroupedDone,
    },
  ]
}

export function GoalGroupedView({
  goals,
  tasks,
  onCreateGoal,
  onEditGoal,
  onDeleteGoal,
  onAttachTasks,
  ...taskListProps
}: GoalGroupedViewProps) {
  const groups = useMemo(() => buildGroups(goals, tasks), [goals, tasks])
  // Collapse "Ungrouped" by default when goals exist; keep goals expanded.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (goals.length > 0) initial.add('ungrouped')
    return initial
  })

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const hasAnyTask = tasks.length > 0
  const visibleGroups = groups.filter(
    (g) => g.tasks.length > 0 || g.goal !== null,
  )

  if (!hasAnyTask && goals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] flex items-center justify-center">
          <Flag className="w-6 h-6 text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">No goals yet</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Create a goal to group work toward an outcome, or add a task — it
            will show up under &quot;Ungrouped&quot; until you attach it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onCreateGoal ? (
            <Button size="sm" onClick={onCreateGoal} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              New goal
            </Button>
          ) : null}
          {taskListProps.onCreateTask ? (
            <Button
              size="sm"
              variant="outline"
              onClick={taskListProps.onCreateTask}
            >
              + New task
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="divide-y divide-white/[0.06]">
      {visibleGroups.map((group) => {
        const isCollapsed = collapsed.has(group.key)
        const isUngrouped = group.goal === null
        const total = group.tasks.length
        const pct = total > 0 ? (group.done / total) * 100 : 0
        return (
          <section key={group.key} aria-label={group.goal?.name ?? 'Ungrouped'}>
            <header
              className={cn(
                'flex items-center gap-3 px-4 md:px-6 py-3 bg-black/20 border-b border-white/[0.04] sticky top-0 z-10',
                isUngrouped && 'bg-black/30',
              )}
            >
              <button
                type="button"
                onClick={() => toggle(group.key)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left hover:text-foreground transition-colors"
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                {isUngrouped ? (
                  <Inbox className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <Flag className="w-4 h-4 text-sky-400 shrink-0" />
                )}
                <span className="font-medium text-sm truncate">
                  {group.goal?.name ?? 'Ungrouped'}
                </span>
                {total > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400/70" />
                    {group.done}/{total}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground shrink-0">
                    empty
                  </span>
                )}
              </button>

              {/* Progress bar — only for real goals with tasks */}
              {group.goal && total > 0 ? (
                <div className="hidden md:block w-28 h-1 rounded-full bg-white/[0.06] overflow-hidden shrink-0">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-sky-400 transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              ) : null}

              {/* Goal actions */}
              {group.goal ? (
                <div className="flex items-center gap-1 shrink-0">
                  {onAttachTasks ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => onAttachTasks(group.goal!)}
                      aria-label={`Attach tasks to ${group.goal.name}`}
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Attach</span>
                    </Button>
                  ) : null}
                  {onEditGoal ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => onEditGoal(group.goal!)}
                      aria-label={`Edit ${group.goal.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  ) : null}
                  {onDeleteGoal ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                      onClick={() => onDeleteGoal(group.goal!)}
                      aria-label={`Delete ${group.goal.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </header>

            {!isCollapsed ? (
              total > 0 ? (
                <TaskList tasks={group.tasks} {...taskListProps} />
              ) : (
                <div className="px-4 md:px-6 py-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    No tasks match the current filters in this goal.
                  </p>
                  {onAttachTasks && group.goal ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3 gap-1.5"
                      onClick={() => onAttachTasks(group.goal!)}
                    >
                      <ListPlus className="w-3.5 h-3.5" />
                      Attach tasks
                    </Button>
                  ) : null}
                </div>
              )
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
