/**
 * @fileType component
 * @domain kody
 * @pattern preview-actions
 * @ai-summary Sticky action bar for Preview: Approve UI, Approve PR, Merge, Fix, Cancel PR
 */
'use client'

import { useState } from 'react'
import type { KodyTask } from '../types'
import { Button } from '@dashboard/ui/button'
import { MergeButton } from './MergeButton'
import { FixRequestDialog } from './FixRequestDialog'
import { ConfirmDialog } from './ConfirmDialog'
import {
  XCircle,
  Wrench,
  Loader2,
  CheckCircle,
  GitPullRequest,
  Eye,
  Camera,
} from 'lucide-react'
import { tasksApi, prsApi } from '../api'
import { useGitHubIdentity } from '../hooks/useGitHubIdentity'
import { usePRCIStatus } from '../hooks/usePRCIStatus'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '../utils'

/**
 * Optimistically add a label to this task in every cached tasks list, so the
 * approve buttons flip immediately after a successful action without waiting
 * for the next poll. Mirrors the backend, which adds the same label.
 */
function applyOptimisticLabel(
  queryClient: ReturnType<typeof useQueryClient>,
  issueNumber: number,
  label: string,
): void {
  queryClient.setQueriesData<KodyTask[]>({ queryKey: ['kody-tasks'] }, (old) =>
    old?.map((t) =>
      t.issueNumber === issueNumber && !t.labels?.includes(label)
        ? { ...t, labels: [...(t.labels ?? []), label] }
        : t,
    ),
  )
}

interface PreviewActionsProps {
  task: KodyTask
  onMerge: () => Promise<void>
  isMerging: boolean
  onCancelPR: () => void
  className?: string
}

export function PreviewActions({
  task,
  onMerge,
  isMerging,
  onCancelPR,
  className,
}: PreviewActionsProps) {
  const [showFixDialog, setShowFixDialog] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isApprovingUI, setIsApprovingUI] = useState(false)
  const [isApprovingPR, setIsApprovingPR] = useState(false)
  const { githubUser } = useGitHubIdentity()
  const queryClient = useQueryClient()

  const actorLogin = githubUser?.login

  // Check if UI / PR are already approved (label-driven, mirrors backend)
  const isUIApproved = task.labels?.includes('ui-approved')
  const isPRApproved = task.labels?.includes('pr-approved')

  const pr = task.associatedPR
  const { data: ciData } = usePRCIStatus(pr?.number)
  const hasConflicts = ciData?.hasConflicts ?? false
  const ciFailed = ciData?.ciStatus === 'failure'
  if (!pr) return null

  const handleCancelPR = async () => {
    setIsCancelling(true)
    try {
      await tasksApi.closePR(task.issueNumber, actorLogin)
      toast.success('PR closed')
      onCancelPR()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to close PR')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleFixSubmit = async (description: string) => {
    try {
      await tasksApi.fixRequest(task.issueNumber, description, actorLogin)
      toast.success('Fix requested — Kody will work on it')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request fix')
      throw err // re-throw so dialog keeps open
    }
  }

  const handleApproveUI = async () => {
    setIsApprovingUI(true)
    try {
      await tasksApi.approveUI(task.issueNumber, actorLogin)
      applyOptimisticLabel(queryClient, task.issueNumber, 'ui-approved')
      toast.success('Preview UI approved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve UI')
    } finally {
      setIsApprovingUI(false)
    }
  }

  const handleApprovePR = async () => {
    setIsApprovingPR(true)
    try {
      await tasksApi.approvePR(task.issueNumber, actorLogin)
      applyOptimisticLabel(queryClient, task.issueNumber, 'pr-approved')
      toast.success('PR approved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve PR')
    } finally {
      setIsApprovingPR(false)
    }
  }

  const postKodyCommand = async (command: string, successMessage: string) => {
    try {
      await prsApi.postComment(pr.number, command, actorLogin)
      toast.success(successMessage)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to post ${command}`)
    }
  }

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-end gap-x-3 gap-y-3 px-4 py-3 border-t border-zinc-800 bg-zinc-950/80 backdrop-blur-sm max-h-[40vh] overflow-y-auto',
          className,
        )}
      >
        {/* ── Group: Approve & Merge (happy path) ── */}
        <div className="flex flex-col gap-1" aria-label="Approve and merge">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-0.5">
            Approve
          </span>
          <div className="flex items-center gap-2">
            {/* Approve UI — outline only, emerald icon/text */}
            {isUIApproved ? (
              <div className="flex items-center gap-1.5 text-emerald-400 px-2.5">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="text-xs hidden sm:inline">UI Approved</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleApproveUI}
                disabled={isApprovingUI}
                className="gap-1.5 cursor-pointer text-emerald-300 bg-transparent border-zinc-700 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-200 active:scale-[0.97]"
              >
                {isApprovingUI ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {isApprovingUI ? 'Approving…' : 'Approve UI'}
                </span>
              </Button>
            )}

            {/* Approve PR — outline only, purple icon/text */}
            {isPRApproved ? (
              <div className="flex items-center gap-1.5 text-purple-400 px-2.5">
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="text-xs hidden sm:inline">PR Approved</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleApprovePR}
                disabled={isApprovingPR}
                className="gap-1.5 cursor-pointer text-purple-300 bg-transparent border-zinc-700 transition-all hover:bg-purple-500/10 hover:border-purple-500/50 hover:text-purple-200 active:scale-[0.97]"
              >
                {isApprovingPR ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <GitPullRequest className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">
                  {isApprovingPR ? 'Approving…' : 'Approve PR'}
                </span>
              </Button>
            )}

            {/* Merge — the only filled button in the bar (primary happy-path action) */}
            {!hasConflicts && !ciFailed && (
              <MergeButton
                prNumber={pr.number}
                prTitle={pr.title}
                branchName={pr.head.ref}
                isMerging={isMerging}
                onMerge={onMerge}
                labels={task.labels}
              />
            )}
          </div>
        </div>

        {/* Divider */}
        <span aria-hidden className="self-stretch w-px bg-zinc-800 my-1" />

        {/* ── Group: Review (inspect & request feedback) ── */}
        <div className="flex flex-col gap-1" aria-label="Review">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-0.5">
            Review
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => postKodyCommand('@kody review', 'Review requested')}
              className="gap-1.5 cursor-pointer text-zinc-300 bg-transparent border-zinc-700 transition-all hover:bg-zinc-800/60 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
              title="Structured diff review"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Review</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => postKodyCommand('@kody ui-review', 'UI review requested')}
              className="gap-1.5 cursor-pointer text-zinc-300 bg-transparent border-zinc-700 transition-all hover:bg-zinc-800/60 hover:border-zinc-600 hover:text-zinc-100 active:scale-[0.97]"
              title="Playwright-based UI review"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">UI Review</span>
            </Button>
          </div>
        </div>

        {/* Divider */}
        <span aria-hidden className="self-stretch w-px bg-zinc-800 my-1" />

        {/* ── Group: Fix (corrective) ── */}
        <div className="flex flex-col gap-1" aria-label="Fix">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 px-0.5">
            Fix
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFixDialog(true)}
              className="gap-1.5 cursor-pointer text-orange-300 bg-transparent border-zinc-700 transition-all hover:bg-orange-500/10 hover:border-orange-500/50 hover:text-orange-200 active:scale-[0.97]"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Fix</span>
            </Button>
          </div>
        </div>

        {/* Sync moved to BranchBehindBanner — only renders when behind base. */}

        {/* Cancel PR — destructive ghost, pushed to the far right */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCancelConfirm(true)}
          disabled={isCancelling}
          className="gap-1.5 cursor-pointer text-red-300/70 bg-transparent border border-transparent transition-all hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-200 active:scale-[0.97] ml-auto self-end"
        >
          {isCancelling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <XCircle className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">Cancel PR</span>
        </Button>
      </div>

      <FixRequestDialog
        isOpen={showFixDialog}
        onClose={() => setShowFixDialog(false)}
        onSubmit={handleFixSubmit}
        prNumber={pr.number}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        title="Close PR"
        description="Close this PR? The branch will remain but the PR will be closed."
        confirmLabel="Close PR"
        variant="destructive"
        onConfirm={handleCancelPR}
        onClose={() => setShowCancelConfirm(false)}
      />
    </>
  )
}
