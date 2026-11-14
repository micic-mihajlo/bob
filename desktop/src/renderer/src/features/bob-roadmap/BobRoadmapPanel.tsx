import type { BobRoadmap, BobRoadmapGoal, BobRoadmapMilestone } from "@bob/contracts/ipc";
import { Button, Card, Check, Checkbox, MapIcon, Progress, Repeat, Spinner, X } from "@bob/ui";
import { useText } from "@bob/ui/text";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";
import { bobRoadmapPort } from "./bob-roadmap-port";

const REFRESH_INTERVAL_MS = 60_000;

interface RoadmapState {
  roadmap: BobRoadmap | null;
  error: string | null;
  /** The task whose tick waits for the Worker. */
  completing: string | null;
}

type StepPhase = "done" | "current" | "next";

/** The stage the founder is in: the milestone of the roadmap's stage, else the first one not done. */
function currentStep(roadmap: BobRoadmap): number {
  const byStage = roadmap.milestones.findIndex((milestone) => milestone.stage === roadmap.stage.index);
  return byStage >= 0 ? byStage : roadmap.milestones.findIndex((milestone) => !milestone.done);
}

function stepPhase(milestone: BobRoadmapMilestone, index: number, current: number): StepPhase {
  if (milestone.done) return "done";
  return index === current ? "current" : "next";
}

/**
 * The Bob roadmap beside the chat: the MRR goal and its date, today's tasks, the roadmap as a line of
 * stages with the planned tasks of each, and the weekly rhythm. It reads the roadmap when it opens,
 * when an Bob turn ends (`busy` goes false), when the window gets focus, and each minute.
 */
export default function BobRoadmapPanel(props: { busy: boolean; onClose: () => void }) {
  const { t, format, errorMessage } = useText();
  const [state, setState] = createSignal<RoadmapState>({ roadmap: null, error: null, completing: null });
  let generation = 0;

  async function refresh() {
    const request = ++generation;
    try {
      const roadmap = await bobRoadmapPort().get();
      if (request === generation) setState((current) => ({ ...current, roadmap, error: null }));
    } catch (error) {
      if (request === generation) {
        setState((current) => ({ ...current, error: errorMessage(error, t("conversation.bobRoadmap.loadFailed")) }));
      }
    }
  }

  async function completeTask(taskId: string) {
    const current = state().roadmap;
    if (!current || state().completing) return;
    generation += 1;
    const ticked = current.today.map((task) => (task.id === taskId ? { ...task, done: true } : task));
    setState({ roadmap: { ...current, today: ticked }, error: null, completing: taskId });
    try {
      const roadmap = await bobRoadmapPort().completeTask(taskId);
      setState({ roadmap, error: null, completing: null });
    } catch (error) {
      setState({
        roadmap: current,
        error: errorMessage(error, t("conversation.bobRoadmap.completeFailed")),
        completing: null,
      });
    }
  }

  onSettled(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      generation += 1;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  });

  createEffect(
    () => props.busy,
    (busy, previous) => {
      if (previous === true && !busy) void refresh();
    },
  );

  const usd = (value: number) => format.currencyUsd(value, { maximumFractionDigits: 0 });
  const deadline = (goal: BobRoadmapGoal) =>
    goal.deadline
      ? format.date(new Date(`${goal.deadline}T00:00:00`), { month: "short", day: "numeric", year: "numeric" })
      : null;

  return (
    <aside class="browser-panel bob-roadmap-panel" aria-label={t("conversation.sidePanel.pane.roadmap")}>
      <header class="file-preview-header side-panel-pane-header">
        <h2 class="side-panel-pane-title">{t("conversation.sidePanel.pane.roadmap")}</h2>
        <Button
          type="button"
          variant="ghost"
          class="browser-toolbar-button side-panel-pane-close"
          aria-label={t("conversation.sidePanel.closePanel")}
          onClick={() => props.onClose()}
        >
          <X class="browser-toolbar-icon" />
        </Button>
      </header>
      <div class="bob-roadmap-body">
        <Show when={state().error}>
          {(error) => (
            <div class="bob-roadmap-error" role="alert">
              <p>{error()}</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void refresh()}>
                {t("conversation.bobRoadmap.retry")}
              </Button>
            </div>
          )}
        </Show>
        <Show
          when={state().roadmap}
          fallback={
            <Show when={!state().error}>
              <div class="bob-roadmap-empty" aria-busy="true">
                <Spinner />
                <p>{t("conversation.bobRoadmap.loading")}</p>
              </div>
            </Show>
          }
        >
          {(roadmap) => (
            <Show
              when={roadmap().goal}
              fallback={
                <div class="bob-roadmap-empty">
                  <MapIcon aria-hidden="true" />
                  <p>{t("conversation.bobRoadmap.empty")}</p>
                </div>
              }
            >
              {(goal) => (
                <>
                  <Card class="bob-roadmap-card">
                    <p class="bob-roadmap-label">{t("conversation.bobRoadmap.goal")}</p>
                    <h3 class="bob-roadmap-goal">{goal().title}</h3>
                    <Show when={goal().why}>{(why) => <p class="bob-roadmap-muted">{why()}</p>}</Show>
                    <Show when={deadline(goal())}>
                      {(date) => (
                        <p class="bob-roadmap-muted">{t("conversation.bobRoadmap.deadline", { date: date() })}</p>
                      )}
                    </Show>
                    <Progress
                      class="bob-roadmap-progress"
                      value={Math.min(roadmap().earnedUsd, goal().targetUsd)}
                      minValue={0}
                      maxValue={Math.max(goal().targetUsd, 1)}
                      aria-label={t("conversation.bobRoadmap.progress")}
                    />
                    <p class="bob-roadmap-earned">
                      {t("conversation.bobRoadmap.earned", {
                        earned: usd(roadmap().earnedUsd),
                        target: usd(goal().targetUsd),
                      })}
                    </p>
                  </Card>

                  <Card class="bob-roadmap-card">
                    <h3 class="bob-roadmap-label">{t("conversation.bobRoadmap.today")}</h3>
                    <ul class="bob-roadmap-list">
                      <For
                        each={roadmap().today.slice(0, 3)}
                        keyed={(task) => task.id}
                        fallback={<li class="bob-roadmap-muted">{t("conversation.bobRoadmap.noTasks")}</li>}
                      >
                        {(task) => (
                          <li class="bob-roadmap-task" data-done={task().done ? "true" : undefined}>
                            <Checkbox
                              id={`bob-roadmap-task-${task().id}`}
                              checked={task().done}
                              disabled={task().done || state().completing !== null}
                              onChange={() => void completeTask(task().id)}
                            />
                            <label class="bob-roadmap-task-title" for={`bob-roadmap-task-${task().id}`}>
                              {task().title}
                            </label>
                            <Show when={task().minutes}>
                              {(minutes) => (
                                <span class="bob-roadmap-task-meta">
                                  {t("conversation.bobRoadmap.minutes", { minutes: minutes() })}
                                </span>
                              )}
                            </Show>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Card>

                  <Show when={roadmap().milestones.length > 0}>
                    <Card class="bob-roadmap-card">
                      <h3 class="bob-roadmap-label">{t("conversation.bobRoadmap.milestones")}</h3>
                      <ol class="bob-roadmap-timeline">
                        <For each={roadmap().milestones} keyed={(milestone) => milestone.id}>
                          {(milestone, index) => {
                            const phase = () => stepPhase(milestone(), index(), currentStep(roadmap()));
                            return (
                              <li
                                class="bob-roadmap-step"
                                data-phase={phase()}
                                aria-current={phase() === "current" ? "step" : undefined}
                              >
                                <span
                                  class="bob-roadmap-node"
                                  role="img"
                                  aria-label={
                                    phase() === "done"
                                      ? t("conversation.bobRoadmap.done")
                                      : phase() === "current"
                                        ? t("conversation.bobRoadmap.current")
                                        : t("conversation.bobRoadmap.next")
                                  }
                                >
                                  <Show when={phase() === "done"}>
                                    <Check aria-hidden="true" />
                                  </Show>
                                </span>
                                <div class="bob-roadmap-step-body">
                                  <Show when={phase() === "current"}>
                                    <p class="bob-roadmap-stage">
                                      {t("conversation.bobRoadmap.stage", {
                                        index: roadmap().stage.index,
                                        total: roadmap().stage.total,
                                        title: roadmap().stage.title,
                                      })}
                                    </p>
                                  </Show>
                                  <p class="bob-roadmap-step-title">{milestone().title}</p>
                                  <Show
                                    when={phase() === "current" ? roadmap().stage.lesson?.split("\n")[0] : undefined}
                                  >
                                    {(lesson) => <p class="bob-roadmap-muted">{lesson()}</p>}
                                  </Show>
                                  <Show when={phase() !== "done" && milestone().tasks?.length}>
                                    <ul class="bob-roadmap-plan">
                                      <For each={milestone().tasks}>
                                        {(task) => (
                                          <li data-done={task.done ? "true" : undefined}>
                                            <span class="bob-roadmap-plan-title">{task.title}</span>
                                            <Show when={task.minutes}>
                                              {(minutes) => (
                                                <span class="bob-roadmap-task-meta">
                                                  {t("conversation.bobRoadmap.minutes", { minutes: minutes() })}
                                                </span>
                                              )}
                                            </Show>
                                          </li>
                                        )}
                                      </For>
                                    </ul>
                                  </Show>
                                </div>
                              </li>
                            );
                          }}
                        </For>
                      </ol>
                    </Card>
                  </Show>

                  <Show when={roadmap().rhythm?.length}>
                    <Card class="bob-roadmap-card">
                      <h3 class="bob-roadmap-label">{t("conversation.bobRoadmap.rhythm")}</h3>
                      <ul class="bob-roadmap-list">
                        <For each={roadmap().rhythm}>
                          {(block) => (
                            <li class="bob-roadmap-rhythm">
                              <Repeat aria-hidden="true" />
                              <span class="bob-roadmap-task-title">{block.title}</span>
                              <span class="bob-roadmap-task-meta">{block.when}</span>
                            </li>
                          )}
                        </For>
                      </ul>
                    </Card>
                  </Show>
                </>
              )}
            </Show>
          )}
        </Show>
      </div>
    </aside>
  );
}
