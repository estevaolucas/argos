import { ComponentProps, memo, useState } from "react";
import clsx from "clsx";
import {
  CheckIcon,
  EllipsisIcon,
  RefreshCcwIcon,
  SparklesIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { useClipboard } from "use-clipboard-copy";

import { useIsLoggedIn } from "@/containers/Auth";
import { BuildMergeQueueIndicator } from "@/containers/BuildMergeQueueIndicator";
import { BuildModeIndicator } from "@/containers/BuildModeIndicator";
import { BuildStatusChip } from "@/containers/BuildStatusChip";
import { BuildTestStatusChip } from "@/containers/BuildTestStatusChip";
import { NavUserControl } from "@/containers/NavUserControl";
import { PullRequestButton } from "@/containers/PullRequestButton";
import { DocumentType, graphql } from "@/gql";
import { BuildMode, BuildType } from "@/gql/graphql";
import { getProjectURL } from "@/pages/Project/ProjectParams";
import { BrandShield } from "@/ui/BrandShield";
import { Button } from "@/ui/Button";
import { Chip } from "@/ui/Chip";
import { HeadlessLink } from "@/ui/Link";
import { Progress } from "@/ui/Progress";
import { Tooltip } from "@/ui/Tooltip";
import { useEventCallback } from "@/ui/useEventCallback";

import { IconButton } from "../../../ui/IconButton";
import { checkDiffCanBeReviewed, useBuildDiffState } from "../BuildDiffState";
import {
  BuildReviewButton,
  DisabledBuildReviewButton,
} from "../BuildReviewButton";
import { useGetDiffEvaluationStatus } from "../BuildReviewState";
import { EvaluationStatus } from "../EvaluationStatus";

const _BuildFragment = graphql(`
  fragment BuildHeader_Build on Build {
    name
    status
    type
    mode
    mergeQueue
    pullRequest {
      id
      url
      ...PullRequestButton_PullRequest
    }
    ...BuildStatusChip_Build
    ...BuildTestStatusChip_Build
  }
`);

const BrandLink = memo(
  ({
    accountSlug,
    projectName,
  }: {
    accountSlug: string;
    projectName: string;
  }) => {
    return (
      <Tooltip content="See all builds">
        <HeadlessLink
          href={`${getProjectURL({ accountSlug, projectName })}/builds`}
          className="transition hover:brightness-125"
        >
          <BrandShield height={32} />
        </HeadlessLink>
      </Tooltip>
    );
  },
);

const ProjectLink = memo(
  ({
    accountSlug,
    projectName,
  }: {
    accountSlug: string;
    projectName: string;
  }) => {
    return (
      <Tooltip content="See all builds">
        <HeadlessLink
          href={`${getProjectURL({ accountSlug, projectName })}/builds`}
          className="text-low data-hovered:text-default rac-focus text-xs leading-none transition"
        >
          {accountSlug}/{projectName}
        </HeadlessLink>
      </Tooltip>
    );
  },
);

function useBuildReviewProgression() {
  const diffState = useBuildDiffState();
  const getDiffEvaluationStatus = useGetDiffEvaluationStatus();
  if (diffState.ready && getDiffEvaluationStatus) {
    const toReview = diffState.allDiffs.filter((diff) =>
      checkDiffCanBeReviewed(diff.status, {
        isSubsetBuild: diffState.isSubsetBuild,
      }),
    );
    const reviewed = toReview.filter(
      (diff) => getDiffEvaluationStatus(diff.id) !== EvaluationStatus.Pending,
    );
    const accepted = toReview.filter(
      (diff) => getDiffEvaluationStatus(diff.id) === EvaluationStatus.Accepted,
    );
    const rejected = toReview.filter(
      (diff) => getDiffEvaluationStatus(diff.id) === EvaluationStatus.Rejected,
    );
    return { toReview, reviewed, accepted, rejected };
  }
  return null;
}

function LoggedReviewButton(props: {
  project: ComponentProps<typeof BuildReviewButton>["project"];
  build: DocumentType<typeof _BuildFragment>;
}) {
  const progression = useBuildReviewProgression();
  if (props.build.mergeQueue) {
    return (
      <DisabledBuildReviewButton tooltip="This build was triggered in a merge queue." />
    );
  }
  if (props.build.type === BuildType.Reference) {
    return <DisabledBuildReviewButton tooltip="Build is auto-approved" />;
  }
  if (!progression) {
    return <DisabledBuildReviewButton tooltip="Loading…" />;
  }
  if (progression.toReview.length === 0) {
    return <DisabledBuildReviewButton tooltip="No changes to review" />;
  }
  const reviewComplete =
    progression.reviewed.length === progression.toReview.length;
  const { color, tooltip, icon } = (() => {
    if (progression.rejected.length > 0) {
      return {
        color: "danger" as const,
        tooltip: "Some changes have been rejected",
        icon: ThumbsDownIcon,
      };
    }
    if (reviewComplete) {
      return {
        color: "success" as const,
        tooltip: "All changes have been accepted",
        icon: ThumbsUpIcon,
      };
    }
    return {
      color: "neutral" as const,
      tooltip: "Track your review progress",
      icon: EllipsisIcon,
    };
  })();
  return (
    <div className="flex items-center gap-4">
      <Tooltip content={tooltip}>
        <div className="flex flex-col gap-1.5">
          <Chip scale="xs" color={color} className="tabular-nums" icon={icon}>
            {progression.reviewed.length} / {progression.toReview.length}{" "}
            reviewed
          </Chip>
          <Progress
            scale="sm"
            value={progression.reviewed.length}
            min={0}
            max={progression.toReview.length}
            className="w-full"
          />
        </div>
      </Tooltip>
      <BuildReviewButton project={props.project} />
    </div>
  );
}

const ConditionalBuildReviewButton = memo(
  (props: {
    project: ComponentProps<typeof BuildReviewButton>["project"];
    build: DocumentType<typeof _BuildFragment>;
  }) => {
    const loggedIn = useIsLoggedIn();
    return loggedIn ? (
      <LoggedReviewButton project={props.project} build={props.build} />
    ) : null;
  },
);

const _ProjectFragment = graphql(`
  fragment BuildHeader_Project on Project {
    ...BuildReviewButton_Project
  }
`);

function createBuildReviewPrompt(input: {
  buildUrl: string;
  pullRequest?: {
    title?: string | null;
    number: number;
    url: string;
    state?: string | null;
    draft?: boolean | null;
    merged?: boolean | null;
    creator?: { login: string; name?: string | null } | null;
  } | null;
}) {
  const pullRequest = input.pullRequest;
  const prAuthor = pullRequest?.creator
    ? pullRequest.creator.name
      ? `${pullRequest.creator.name} (@${pullRequest.creator.login})`
      : `@${pullRequest.creator.login}`
    : null;

  return [
    "Review this Argos build and create the Argos build review.",
    "",
    "Prefer using $argos-pr-review if that skill is available. If it is not available, follow the workflow below directly.",
    "",
    "Inputs:",
    `- Argos build: ${input.buildUrl}`,
    `- Pull request: ${pullRequest ? pullRequest.url : "not linked in Argos"}`,
    pullRequest?.title ? `- PR title: ${pullRequest.title}` : null,
    pullRequest?.state ? `- PR state: ${pullRequest.state}` : null,
    pullRequest?.draft != null
      ? `- Draft: ${pullRequest.draft ? "yes" : "no"}`
      : null,
    pullRequest?.merged != null
      ? `- Merged: ${pullRequest.merged ? "yes" : "no"}`
      : null,
    prAuthor ? `- PR author: ${prAuthor}` : null,
    "",
    "Before accessing external tools:",
    "Ask the user for permission before using tools that may access private or sensitive data, including GitHub CLI/API, Jira, Linear, or any ticketing/project-management system. Explain which tools you want to use and why. Do not ask for permission to use the Argos CLI for this Argos build review; it is required for the task.",
    "",
    "Authentication:",
    "The Argos CLI requires a token to read build data. Before running build inspection commands, check whether `ARGOS_TOKEN` is available in the environment or whether a token was provided with `--token`.",
    "If no CLI token is available, ask the user to provide `ARGOS_TOKEN` or a `--token` value. If the user does not provide one, stop the process before running Argos CLI commands.",
    "Creating an Argos build review requires a personal access token. Check whether it is stored in `~/.config/argos-ci/config.json` under the `token` field.",
    "If the personal access token is not available, do not post the review on the Argos build. Finish by giving the review conclusion and evidence to the user instead, because CLI access is not sufficient to create the review.",
    "Do not use project tokens for review creation.",
    "",
    "Goal:",
    "Decide whether the Argos visual changes should be approved or rejected. Base the decision on the Argos build data, screenshots, visual diffs, the PR context, the code diff, and any linked ticket or issue that is accessible.",
    "",
    "Workflow:",
    "1. Ensure a CLI token for build inspection is available from `ARGOS_TOKEN` or `--token`. If not, ask the user for one and stop if it is not provided.",
    "2. Check whether a personal access token is available in `~/.config/argos-ci/config.json` for review submission.",
    "3. Inspect the Argos build metadata first with the Argos CLI: `ARGOS_TOKEN=<token> argos build get <build-url> --json` or `argos build get <build-url> --token <token> --json`.",
    "4. If the build is still pending or processing, stop and report that it cannot be reviewed yet. Do not approve an unfinished build.",
    "5. Fetch only the diffs that need review with the Argos CLI: `ARGOS_TOKEN=<token> argos build snapshots <build-url> --needs-review --json` or `argos build snapshots <build-url> --token <token> --needs-review --json`.",
    "6. If the Argos CLI is missing, cannot authenticate, or cannot access the build, stop and report the exact blocker. Do not submit a review from incomplete Argos data.",
    "7. Group duplicate snapshots by Argos group/hash and inspect one representative per visual group unless browser-specific differences appear.",
    "8. Inspect the PR context when a PR is available: title, description, labels/metadata, commits, changed files, code diff, tests, and comments that clarify intent.",
    "9. Look for linked tickets or issues in the PR title, branch, description, comments, or commit messages. If accessible, read the ticket acceptance criteria, screenshots, design notes, and bug reports. If a ticket is not accessible, say so and continue with the evidence you have.",
    "10. Form the intended user-facing change from the PR and ticket before judging the screenshots.",
    "11. For each Argos diff, compare the base screenshot, head screenshot, and diff mask. Check whether the rendered change matches the intended change and whether the touched code plausibly explains it.",
    "12. Pay special attention to regressions: missing content, wrong route, wrong state, clipped text, overlap, broken layout, unexpected loader/skeleton, theme mismatch, removed screenshots without matching test deletion, and content that contradicts the PR/ticket intent.",
    "13. Check for flakiness: visible loading state, partial async data, animation mid-frame, dynamic values, retry metadata, or the same transient capture across browsers.",
    "14. Make a binary Argos review decision: approve only when the visual changes are intentional and stable; request changes when there is a regression, unresolved flake, failed/aborted build, or insufficient evidence to safely approve.",
    "",
    "Output before submitting:",
    "- Briefly summarize the PR/ticket intent you inferred.",
    "- Summarize the Argos diffs reviewed, naming important snapshots.",
    "- Explain the evidence for approval or for each requested change.",
    "- State the exact conclusion you will submit: `approve` or `request-changes`.",
    "",
    "Submit the Argos review:",
    "- Only submit the Argos review if a personal access token is available from `~/.config/argos-ci/config.json` or another explicit personal-token source.",
    "- If everything is intentional and stable, run `argos build review <build-url> --token <personal-token> --conclusion approve --json`.",
    "- If any visual regression or unresolved flake remains, run `argos build review <build-url> --token <personal-token> --conclusion request-changes --json`.",
    "- If no personal access token is available, do not post the review on Argos. Give the user the conclusion, the evidence, and say that posting was skipped because the CLI does not have sufficient access.",
    "- If blocked unexpectedly, report the exact command attempted, the exact error, and whether the token was missing, unreadable, rejected, or insufficiently privileged.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function CopyBuildReviewPromptButton(props: {
  buildNumber: number;
  accountSlug: string;
  projectName: string;
  build: DocumentType<typeof _BuildFragment>;
}) {
  const clipboard = useClipboard({ copiedTimeout: 2000 });
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const buildPath = `${getProjectURL({
    accountSlug: props.accountSlug,
    projectName: props.projectName,
  })}/builds/${props.buildNumber}`;
  const buildUrl = new URL(buildPath, window.location.origin).toString();
  const prompt = createBuildReviewPrompt({
    buildUrl,
    pullRequest: props.build.pullRequest,
  });
  const copy = () => {
    clipboard.copy(prompt);
  };

  return (
    <Tooltip
      content={clipboard.copied ? "Copied!" : "Copy AI review prompt"}
      isOpen={clipboard.copied || isTooltipOpen}
      onOpenChange={setIsTooltipOpen}
    >
      <IconButton
        variant="outline"
        aria-label="Copy AI review prompt"
        onPress={copy}
      >
        <span className="relative size-4 overflow-hidden">
          <span
            className={clsx(
              "text-low absolute flex flex-col transition [&>svg]:size-4",
              clipboard.copied && "-translate-y-4",
            )}
          >
            <SparklesIcon
              className={clsx("transition", clipboard.copied && "opacity-0")}
            />
            <CheckIcon />
          </span>
        </span>
      </IconButton>
    </Tooltip>
  );
}

export const BuildHeader = memo(
  (props: {
    buildNumber: number;
    accountSlug: string;
    projectName: string;
    build: DocumentType<typeof _BuildFragment> | null;
    project: DocumentType<typeof _ProjectFragment> | null;
  }) => {
    const { build, project } = props;
    return (
      <div className="flex w-screen min-w-0 flex-none grow-0 items-center justify-between gap-4 border-b-[0.5px] p-4">
        <div className="flex h-8 items-center gap-4">
          <div className="relative flex">
            <BrandLink
              accountSlug={props.accountSlug}
              projectName={props.projectName}
            />
            <SyncingIcon />
          </div>
          <div className="flex flex-col justify-center">
            <div className="mb-1 flex items-start gap-1">
              <BuildModeIndicator
                mode={build ? build.mode : BuildMode.Ci}
                scale="sm"
              />
              <div className="text-sm leading-none font-medium">
                Build {props.buildNumber}
                {build && build.name !== "default" ? ` • ${build.name}` : ""}
              </div>
            </div>
            <div className="flex">
              <ProjectLink
                accountSlug={props.accountSlug}
                projectName={props.projectName}
              />
            </div>
          </div>
          {build ? <BuildStatusChip build={build} /> : null}
          {build ? <BuildTestStatusChip build={build} /> : null}
        </div>
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex items-center gap-2 empty:hidden">
            {build?.mergeQueue ? <BuildMergeQueueIndicator /> : null}
            {build?.pullRequest ? (
              <PullRequestButton pullRequest={build.pullRequest} size="small" />
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {build && project && (
              <ConditionalBuildReviewButton build={build} project={project} />
            )}
            {build ? (
              <CopyBuildReviewPromptButton
                build={build}
                buildNumber={props.buildNumber}
                accountSlug={props.accountSlug}
                projectName={props.projectName}
              />
            ) : null}
          </div>
          <NavUserControl />
        </div>
      </div>
    );
  },
);

function SyncingIcon() {
  const { isLoading } = useBuildDiffState();
  return <SyncingIconMemo isLoading={isLoading} />;
}

const SyncingIconMemo = memo(function SyncingIconMemo(props: {
  isLoading: boolean;
}) {
  const { isLoading } = props;
  return (
    <Tooltip content={isLoading ? "Loading snapshots..." : null}>
      <div
        aria-label="Loading snapshots..."
        aria-busy={isLoading}
        className={clsx(
          "bg-app absolute -right-1 -bottom-1 rounded-full border p-1 transition-all transition-discrete",
          isLoading ? "opacity-100" : "hidden opacity-0",
        )}
      >
        <RefreshCcwIcon
          strokeWidth={1}
          className="size-3 animate-spin duration-1500"
        />
      </div>
    </Tooltip>
  );
});
