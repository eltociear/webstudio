import { useStore } from "@nanostores/react";
import {
  componentsBase,
  type ErrorResponse,
  type SuccessResponse,
} from "@webstudio-is/ai";
import type { Theme } from "@webstudio-is/css-data";
import {
  Box,
  Button,
  Card,
  Dialog,
  DialogContent,
  Flex,
  IconButton,
  Text,
  theme,
} from "@webstudio-is/design-system";
import { CrossIcon, SpinnerIcon, WebstudioIcon } from "@webstudio-is/icons";
import type { WsEmbedTemplate } from "@webstudio-is/react-sdk";
import { useEffect, useMemo, useReducer, useRef } from "react";
import type { AsyncReturnType } from "type-fest";
import {
  computeInstancesConstraints,
  findClosestDroppableTarget,
  getTemplateData,
  insertTemplate,
  insertTemplateData,
} from "~/shared/instance-utils";
import {
  instancesStore,
  projectStore,
  registeredComponentMetasStore,
  selectedInstanceSelectorStore,
  selectedInstanceStore,
} from "~/shared/nano-states";
import { aiPath } from "~/shared/router-utils";
import ComponentsViewer from "./components-viewer";
import { ColorPreview, ThemeEditor } from "./theme-editor";

type StepError = {
  type: "error";
  message: string;
  step: Step["id"];
};

type StepQuestion<Id> = {
  type: "question";
  id: Id;
  question: string;
  answer: string | null;
};

type StepAi<Id extends keyof Steps, Answer> = {
  type: "ai";
  id: Id;
  message: string;
  prompt: (steps: Steps) => string;
  answer: Answer | null;
};

type StepAiParallel<Id extends keyof Steps, Data, Answer> = {
  type: "ai:parallel";
  id: Id;
  message: string;
  data: Data[];
  steps: StepAi<Id, Answer>[];
};

type StepData<Id, Data> = {
  type: "data";
  id: Id;
  answer: Data | null;
};

type Steps = {
  description: StepQuestion<"description">;
  context_sections: StepQuestion<"context_sections">;
  // context_details: StepQuestion<"context_details">;
  style: StepQuestion<"style">;
  theme: StepAi<"theme", Theme>;
  components: StepData<
    "components",
    { name: "base"; components: typeof componentsBase }
  >;
  sections: StepAi<"sections", string[]>;
  ui: StepAiParallel<"ui", string, WsEmbedTemplate>;
  // ui: StepAi<"ui", WsEmbedTemplate>;
};

type Step = Steps[keyof Steps];
type State = {
  step: Step["id"];
  error?: StepError;
  steps: { [K in keyof Steps]: Steps[K] };
};

type Action =
  | {
      type: "goTo";
      step: Step["id"];
    }
  | {
      type: "update";
      value: Step;
    }
  | StepError;

const getInitialState: () => State = () => ({
  step: "description",
  steps: {
    description: {
      type: "question",
      id: "description",
      question:
        "Hi there!\nPlease tell me about the page you want me to create. What is it about?",
      answer: null,
      // answer: "a website for a yoga studio",
    },
    context_sections: {
      type: "question",
      id: "context_sections",
      question:
        "Awesome! Now provide a list of sections you want in your page.\nFor example: header, hero, testimonials. footer.",
      answer: null,
      // answer: "header, hero, testimonials and footer",
    },
    // context_details: {
    //   type: "question",
    //   id: "context_details",
    //   question:
    //     "Tell me more about the page layout and other stylistic requirements",
    //   // answer: null,
    //   answer: "",
    //   // "Design a calming and user-friendly landing page for a holistic Yoga studio, focusing on offering Yoga classes and courses for all, run by a certified Yoga instructor. Reflect the universal accessibility of yoga and the expertise of the instructor through the website's design and layout.",
    // },
    style: {
      type: "question",
      id: "style",
      question: "Love it! Tell me about the style, colors and vibes",
      answer: null,
      // answer: "Pastel colors, zen, calm and cosy",
    },
    theme: {
      type: "ai",
      id: "theme",
      prompt: (steps) =>
        `We are working on the following project:\n${steps.description.answer}\n\nThe style and colors requested:\n${steps.style.answer}`,
      message: "Generating theme",
      answer: null,
    },
    components: {
      type: "data",
      id: "components",
      answer: null,
    },
    sections: {
      type: "ai",
      id: "sections",
      prompt: (steps) =>
        `We are working on the following project:\n${steps.description.answer}\n\nWe want the following sections with nice layouts:\n${steps.context_sections.answer}\n\nThe style and colors requested:\n${steps.style.answer}`,
      message: "Progessing all the data",
      answer: null,
    },
    ui: {
      type: "ai:parallel",
      id: "ui",
      message: "Generating UI",
      data: [],
      steps: [],
    },
  },
});

const reducer = function reducer(state: State, action: Action) {
  if (action.type === "goTo") {
    return {
      ...state,
      error: undefined,
      step: action.step,
    };
  }

  if (action.type === "error") {
    return {
      ...state,
      error: action,
    };
  }

  const step = action.value;
  const steps = { ...state.steps };

  if (step.id in steps) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore Figure out how to fix this.
    steps[step.id] = step;
  }

  return {
    steps,
    error: undefined,
    step: state.step,
  };
};

const createUiStepAi = ({
  prompt,
  message = "Preparing data",
}: {
  prompt: string;
  message?: string;
}): StepAi<"ui", WsEmbedTemplate> => ({
  type: "ai",
  id: "ui",
  prompt: (steps) => prompt,
  message,
  answer: null,
});

const useAi = function useAi(
  [state, dispatch]: [State, React.Dispatch<Action>],
  components: string[],
  abort: React.MutableRefObject<AbortController | null>
) {
  useEffect(() => {
    if (state.error) {
      return;
    }

    const step = state.steps[state.step];

    // Run only when step.type is "ai" or "ai:parallel".
    if (step.type !== "ai" && step.type !== "ai:parallel") {
      return;
    }

    // If step.type is "ai" make sure that it doesn't have an "answer" already.
    if (step.type !== "ai:parallel" && step.answer !== null) {
      return;
    }

    // "ai:parallel" actions are similar as above except that they contain an array of "ai" actions in its "steps" field.
    if (
      step.type === "ai:parallel" &&
      step.steps.length > 0 &&
      step.steps.every((step) => step.answer !== null)
    ) {
      return;
    }

    const instance = selectedInstanceStore.get();
    const project = projectStore.get();

    if (instance === undefined || project === undefined) {
      dispatch({
        type: "error",
        message: "Not selected instance or missing project id",
        step: step.id,
      });
      return;
    }

    abort.current = new AbortController();
    const signal = abort.current.signal;

    type CurrentStep = typeof step;

    // We exclude StepAiParallel because below we turn it into a series of StepAi that are ran in parallel.
    type ExcludeStepAiParallel<T> = T extends StepAiParallel<any, any, any>
      ? never
      : T;
    const run = async function run(
      step: ExcludeStepAiParallel<CurrentStep>,
      prompt: string
    ) {
      return retry<CurrentStep["id"], [(typeof step)["answer"]]>(() =>
        request<CurrentStep["id"], [(typeof step)["answer"]]>(aiPath(), {
          method: "POST",
          body: JSON.stringify({
            _action: "generate",
            steps: [step.id],
            instanceId: instance.id,
            projectId: project.id,
            prompt,
            theme:
              state.steps.theme.answer === null
                ? ""
                : JSON.stringify(state.steps.theme.answer),
            components: JSON.stringify(components),
          }),
          signal,
        })
      );
    };

    const onComplete = function onComplete(
      result: AsyncReturnType<typeof run>
    ) {
      abort.current = null;

      if (result.success === false) {
        dispatch({
          type: "error",
          message: result.message,
          step: step.id,
        });

        return;
      }

      const response = result.responses[0];
      if (response.step !== step.id) {
        dispatch({
          type: "error",
          message: "Response mismatch",
          step: step.id,
        });

        return;
      }

      if (step.id === "sections") {
        dispatch({
          type: "update",
          value: {
            ...state.steps.ui,
            data: response.json[0],
            // @todo remove as CurrentStep and fix type issue
          } as CurrentStep,
        });
      }

      dispatch({
        type: "update",
        value: {
          ...step,
          answer: response.json[0],
          // @todo remove as CurrentStep and fix type issue
        } as CurrentStep,
      });

      if (step.id === "sections") {
        dispatch({
          type: "goTo",
          step: "ui",
        });

        return;
      }

      if (step.id === "theme") {
        dispatch({
          type: "update",
          value: {
            ...state.steps.components,
            answer: {
              name: "base",
              components: componentsBase,
            },
          },
        });
        dispatch({
          type: "goTo",
          step: "components",
        });

        return;
      }

      dispatch({
        type: "error",
        message: "Invalid step",
        step: step.id,
      });
    };

    if (step.type === "ai:parallel") {
      const parallelSteps = step.data.map((answer) =>
        createUiStepAi({
          prompt: answer,
        })
      );

      const requests = parallelSteps.map((step, index) =>
        run(step, step.prompt(state.steps)).then((result) => {
          if (result.success) {
            onUiSection({
              template: result.responses[0].json[0],
              instanceId: instance.id,
              index,
            });
            return result;
          }
          return result;
        })
      );

      // update the main ai:parallel
      Promise.all(requests).then((responses) => {
        abort.current = null;
        dispatch({
          type: "update",
          value: {
            ...step,
            steps: parallelSteps.map((step, index) => {
              const response = responses[index];
              return {
                ...step,
                answer: response.success ? response.responses[0].json[0] : null,
              };
            }),
            // @todo remove as CurrentStep and fix type issue
          } as CurrentStep,
        });
      });
    } else {
      const prompt = step.prompt(state.steps);
      run(step, prompt).then(onComplete);
    }

    return () => {
      abort.current?.abort();
      abort.current = null;
    };
  }, [state, dispatch, abort, components]);
};

export const AI = ({ onDone }: { onDone?: () => void }) => {
  const store = useReducer(reducer, getInitialState());
  const [state, dispatch] = store;

  const aiAbort = useRef<AbortController | null>(null);

  const metas = useStore(registeredComponentMetasStore);

  const components = useMemo(() => {
    const exclude = ["Body", "Slot"];
    return [...metas.keys()].filter((name) => !exclude.includes(name));
  }, [metas]);

  useAi(store, components, aiAbort);

  const step = state.steps[state.step];
  const messages = Object.values(state.steps)
    .map((s) => {
      // flatten step of type "ai:parallel"
      if (s.type === "ai:parallel") {
        return s.steps;
      }
      return s;
    })
    .flat()
    .filter(
      (s) => s.answer !== null || (s.id === step.id && step.type === "question")
    );

  const error = state.error;
  const loadingMessage =
    (error === undefined && step.type === "ai") || step.type === "ai:parallel"
      ? step.message
      : null;

  const dialogStyles =
    step.id === "ui"
      ? {
          bottom: theme.spacing[10],
          top: "auto",
          transform: "translate(-50%,0)",
          width: 600,
        }
      : {
          width: 600,
        };

  const currentQuestionRef = useRef<HTMLDivElement | null>(null);
  const sendAnswer = () => {
    if (currentQuestionRef.current === null || step.type !== "question") {
      return;
    }
    dispatch({
      type: "update",
      value: {
        ...step,
        answer: currentQuestionRef.current.innerText.trim(),
      },
    });

    currentQuestionRef.current.innerText = "";

    setTimeout(() => {
      let next: Step["id"] | undefined;

      switch (step.id) {
        case "description":
          next = "context_sections";
          break;
        case "context_sections":
          next = "style";
          break;
        case "style":
          next = "theme";
          break;
      }

      if (next) {
        dispatch({ type: "goTo", step: next });
      }
    }, 250);
  };

  useEffect(() => {
    if (
      typeof onDone === "function" &&
      step.id === "ui" &&
      step.steps.length > 0 &&
      error === undefined
    ) {
      onDone();
    }
  }, [step, onDone, error]);

  return (
    <Dialog open={true}>
      <DialogContent
        css={{
          border: "none",
          backgroundColor: "transparent",
          boxShadow: "none",
          maxWidth: "100%",
          overflowY: "auto",
          ...dialogStyles,
        }}
        overlayBackdrop={false}
      >
        <Card
          css={{
            boxShadow: theme.shadows.brandElevationBig,
            width: "100%",
            position: "relative",
          }}
        >
          <Box css={{ height: theme.spacing[6] }} />
          {/* Chat */}
          {step.id !== "ui" && messages.length > 0
            ? messages.map((message, index) => {
                if (message.type === "question") {
                  return (
                    <Box key={index}>
                      <AiMessage message={message.question} />
                      {message.answer ? (
                        <Flex gap="3" css={{ padding: theme.spacing[8] }}>
                          <UserIcon />
                          <Text
                            css={{
                              fontSize: 14,
                              lineHeight: 1.5,
                              flex: 1,
                              whiteSpace: "pre-line",
                            }}
                          >
                            {message.answer}
                          </Text>
                        </Flex>
                      ) : null}
                    </Box>
                  );
                }

                if (
                  message.type === "ai" &&
                  message.id === "theme" &&
                  message.answer
                ) {
                  return step.id === "components" ? (
                    <AiMessage
                      key={index}
                      message="I created this theme for you. Please feel free to edit the colors if you want. Once you are done press the continue button."
                    >
                      <Flex
                        direction="column"
                        gap={4}
                        css={{ marginTop: theme.spacing[8] }}
                      >
                        <Box
                          css={{
                            padding: theme.spacing[8],
                            borderRadius: theme.borderRadius[6],
                            backgroundColor: theme.colors.white,
                            boxShadow: theme.shadows.brandElevationBig,
                          }}
                        >
                          <ThemeEditor
                            theme={message.answer}
                            onChange={(updatedTheme) => {
                              dispatch({
                                type: "update",
                                value: {
                                  ...message,
                                  answer: updatedTheme,
                                },
                              });
                            }}
                          />
                        </Box>
                        <Button
                          onClick={() => {
                            dispatch({
                              type: "goTo",
                              step: "sections",
                            });
                          }}
                        >
                          continue
                        </Button>
                      </Flex>
                    </AiMessage>
                  ) : (
                    <AiMessage message="Your theme">
                      <Flex gap={2}>
                        {Object.values(message.answer.backgroundColor).map(
                          (color, index) => (
                            <ColorPreview key={index} color={color} />
                          )
                        )}
                      </Flex>
                    </AiMessage>
                  );
                }

                if (
                  step.id === "components" &&
                  message.type === "data" &&
                  message.id === "components" &&
                  message.answer
                ) {
                  return (
                    <Box key={index} css={{ marginBottom: theme.spacing[6] }}>
                      <ComponentsViewer
                        theme={state.steps.theme.answer}
                        components={message.answer}
                      />
                    </Box>
                  );
                }

                return null;
              })
            : null}
          {/* End of Chat */}

          {typeof loadingMessage === "string" ? (
            <Box css={{ marginTop: theme.spacing[4] }}>
              <AiMessage message={loadingMessage} isLoading={true}>
                <Button
                  css={{
                    textTransform: "uppercase",
                    marginTop: theme.spacing[3],
                  }}
                  onClick={() => {
                    if (window.confirm("Are you sure you want to abort?")) {
                      aiAbort.current?.abort();
                      if (step.type === "ai") {
                        dispatch({
                          type: "error",
                          message: "aborted",
                          step: step.id,
                        });
                      }
                    }
                  }}
                >
                  Stop
                </Button>
              </AiMessage>
            </Box>
          ) : null}

          {error ? (
            <AiMessage message="Something went wrong.">
              <Button
                css={{
                  textTransform: "uppercase",
                  marginTop: theme.spacing[4],
                }}
                onClick={() => {
                  dispatch({
                    type: "update",
                    value: { ...step },
                  });
                }}
              >
                Retry
              </Button>
            </AiMessage>
          ) : null}

          {step.type === "question" ? (
            <Flex
              gap={3}
              align="center"
              css={{
                marginTop: theme.spacing[4],
                marginBottom: `-${theme.spacing[8]}`,
                padding: theme.spacing[8],
              }}
            >
              <UserIcon />
              <Box
                ref={currentQuestionRef}
                key={step.id}
                autoFocus
                css={inputStyles}
                contentEditable
                onKeyPress={(event) => {
                  if (event.key === "Enter" && event.shiftKey === false) {
                    event.preventDefault();
                    sendAnswer();
                  }
                }}
              />

              <Button
                css={{ display: "block", minHeight: "1.5em" }}
                onClick={(event) => {
                  sendAnswer();
                }}
              >
                Send
              </Button>
            </Flex>
          ) : null}

          <IconButton
            css={{
              position: "absolute",
              top: theme.spacing[3],
              right: theme.spacing[3],
            }}
            onClick={() => {
              if (aiAbort.current) {
                if (window.confirm("Are you sure you want to abort?")) {
                  aiAbort.current?.abort();
                  aiAbort.current = null;
                  if (typeof onDone === "function") {
                    onDone();
                  }
                }
              } else if (typeof onDone === "function") {
                onDone();
              }
            }}
          >
            <CrossIcon />
          </IconButton>
        </Card>
      </DialogContent>
    </Dialog>
  );
};

const UserIcon = () => (
  <Box
    css={{
      width: 24,
      height: 24,
      background: `linear-gradient(135deg, ${theme.colors.blue10}, ${theme.colors.pink10})`,
      borderRadius: theme.borderRadius.round,
    }}
  />
);

const AiMessage = ({
  message,
  isLoading = false,
  children,
}: {
  message: string;
  isLoading?: boolean;
  children?: React.ReactElement;
}) => (
  <Flex
    gap="3"
    css={{
      border: `1px solid ${theme.colors.gray5}`,
      borderRadius: theme.borderRadius[6],
      // borderBottom: `1px solid ${theme.colors.gray6}`,
      backgroundColor: theme.colors.gray2,
      padding: theme.spacing[8],
    }}
  >
    {isLoading ? <SpinnerIcon size={24} /> : <WebstudioIcon size={24} />}{" "}
    <Box css={{ flex: 1 }}>
      <Text css={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-line" }}>
        {message}
      </Text>
      {children}
    </Box>
  </Flex>
);

const inputStyles = {
  minHeight: "1.5em",
  lineHeight: 1.5,
  flex: 1,
  fontSize: 14,
  boxShadow: theme.shadows.brandElevationBig,
  borderRadius: theme.borderRadius[6],
  backgroundColor: theme.colors.backgroundTopbar,
  color: theme.colors.gray2,
  padding: theme.spacing[8],
};

const request = function request<Name, Data>(
  ...args: Parameters<typeof fetch>
) {
  return fetch(...args)
    .then((res) => {
      if (res.ok === false) {
        return {
          success: false,
          type: "generic_error",
          status: res.status,
          message: res.statusText,
        };
      }
      return res.json();
    })
    .catch((error) => ({
      success: false,
      type: error.name === "AbortError" ? "aborted" : "generic_error",
      status: 500,
      message: "",
    })) as Promise<SuccessResponse<Name, Data> | ErrorResponse>;
};

const retry = function retry<Name, Data>(
  fn: () => Promise<SuccessResponse<Name, Data> | ErrorResponse>,
  times = 3,
  timeout = 45000
): Promise<SuccessResponse<Name, Data> | ErrorResponse> {
  return fn().then((result) => {
    if (result.success === true) {
      return result;
    }
    if (times > 0) {
      return retry(fn, times - 1);
    }
    return {
      success: false,
      type: "retry_limit_reached",
      status: 500,
      message: "",
    };
  });
};

const onUiSection = function onUiSection({
  template,
  instanceId,
  index,
}: {
  template: WsEmbedTemplate;
  instanceId: string;
  index: number;
}) {
  const selectedInstanceSelector = selectedInstanceSelectorStore.get();

  if (!selectedInstanceSelector || selectedInstanceSelector[0] !== instanceId) {
    throw new Error("Invalid selected instance");
  }

  const templateData = getTemplateData(template);

  if (templateData === undefined) {
    throw new Error("Invalid template");
  }

  const metas = registeredComponentMetasStore.get();
  const newInstances = new Map(
    templateData.instances.map((instance) => [instance.id, instance])
  );
  const rootInstanceIds = templateData.children
    .filter((child) => child.type === "id")
    .map((child) => child.value);

  const dropTarget = findClosestDroppableTarget(
    metas,
    instancesStore.get(),
    selectedInstanceSelector,
    computeInstancesConstraints(metas, newInstances, rootInstanceIds)
  );

  if (dropTarget) {
    dropTarget.position = index;
    insertTemplateData(templateData, dropTarget);

    selectedInstanceSelectorStore.set([
      instanceId,
      ...dropTarget.parentSelector,
    ]);
  } else {
    throw new Error("Invalid selected instance");
  }
};

// prettier-ignore
const testTheme = {
    "backgroundColor": {
      "base": {
          "type": "rgb",
          "alpha": 1,
          "r": 252,
          "g": 231,
          "b": 243
        }
      ,
      "elevate":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 248,
          "g": 214,
          "b": 232
        }
      ,
      "primary":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 248,
          "g": 214,
          "b": 232
        }
      ,
      "secondary":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 252,
          "g": 231,
          "b": 243
        }
      ,
      "accent":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 255,
          "g": 182,
          "b": 217
        }
      ,
      "muted":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 252,
          "g": 231,
          "b": 243
        }
      ,
      "destructive":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 255,
          "g": 214,
          "b": 232
        }

    },
    "color": {
      "base":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 51,
          "g": 51,
          "b": 51
        }
      ,
      "elevate":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 102,
          "g": 102,
          "b": 102
        }
      ,
      "primary":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 51,
          "g": 51,
          "b": 51
        }
      ,
      "secondary":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 102,
          "g": 102,
          "b": 102
        }
      ,
      "accent":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 255,
          "g": 182,
          "b": 217
        }
      ,
      "muted":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 153,
          "g": 153,
          "b": 153
        }
      ,
      "destructive":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 255,
          "g": 51,
          "b": 51
        }

    },
    "border": {
      "base":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 204,
          "g": 204,
          "b": 204
        }
      ,
      "elevate":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 204,
          "g": 204,
          "b": 204
        }
      ,
      "primary":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 204,
          "g": 204,
          "b": 204
        }
      ,
      "secondary":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 204,
          "g": 204,
          "b": 204
        }
      ,
      "accent":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 255,
          "g": 182,
          "b": 217
        }
      ,
      "muted":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 204,
          "g": 204,
          "b": 204
        }
      ,
      "destructive":
        {
          "type": "rgb",
          "alpha": 1,
          "r": 255,
          "g": 51,
          "b": 51
        }

    },
    "boxShadowColor": {
      "base":
        {
          "type": "rgb",
          "alpha": 0.1,
          "r": 0,
          "g": 0,
          "b": 0
        }
      ,
      "elevate":
        {
          "type": "rgb",
          "alpha": 0.2,
          "r": 0,
          "g": 0,
          "b": 0
        }
      ,
      "primary":
        {
          "type": "rgb",
          "alpha": 0.1,
          "r": 0,
          "g": 0,
          "b": 0
        }
      ,
      "secondary":
        {
          "type": "rgb",
          "alpha": 0.2,
          "r": 0,
          "g": 0,
          "b": 0
        }
      ,
      "accent":
        {
          "type": "rgb",
          "alpha": 0.5,
          "r": 255,
          "g": 182,
          "b": 217
        }
      ,
      "muted":
        {
          "type": "rgb",
          "alpha": 0.1,
          "r": 0,
          "g": 0,
          "b": 0
        }
      ,
      "destructive":
        {
          "type": "rgb",
          "alpha": 0.5,
          "r": 255,
          "g": 51,
          "b": 51
        }

    },
    "gradientColorStops": [
      [
        {
          "type": "rgb",
          "alpha": 1,
          "r": 255,
          "g": 182,
          "b": 217
        },
        {
          "type": "rgb",
          "alpha": 1,
          "r": 252,
          "g": 231,
          "b": 243
        }
      ],
      [
        {
          "type": "rgb",
          "alpha": 1,
          "r": 252,
          "g": 231,
          "b": 243
        },
        {
          "type": "rgb",
          "alpha": 1,
          "r": 255,
          "g": 182,
          "b": 217
        }
      ],
      [
        {
          "type": "rgb",
          "alpha": 1,
          "r": 255,
          "g": 182,
          "b": 217
        },
        {
          "type": "rgb",
          "alpha": 1,
          "r": 252,
          "g": 231,
          "b": 243
        }
      ]
    ],
    "fontFamily": {
      "base": {
        "type": "fontFamily",
        "value": [
          "'Roboto', sans-serif"
        ]
      },
      "headings": {
        "type": "fontFamily",
        "value": [
          "'Playfair Display', serif"
        ]
      }
    },
    "fontSize": {
      "xs": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 0.75
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "rem",
            "value": 1
          }
        }
      ],
      "sm": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 0.875
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "rem",
            "value": 1.25
          }
        }
      ],
      "base": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 1
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "rem",
            "value": 1.5
          }
        }
      ],
      "lg": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 1.125
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "rem",
            "value": 1.75
          }
        }
      ],
      "xl": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 1.25
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "rem",
            "value": 1.75
          }
        }
      ],
      "2xl": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 1.5
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "rem",
            "value": 2
          }
        }
      ],
      "3xl": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 1.875
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "rem",
            "value": 2.25
          }
        }
      ],
      "4xl": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 2.25
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "rem",
            "value": 2.5
          }
        }
      ],
      "5xl": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 3
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "number",
            "value": 1
          }
        }
      ],
      "6xl": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 3.75
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "number",
            "value": 1
          }
        }
      ],
      "7xl": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 4.5
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "number",
            "value": 1
          }
        }
      ],
      "8xl": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 6
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "number",
            "value": 1
          }
        }
      ],
      "9xl": [
        {
          "type": "unit",
          "unit": "rem",
          "value": 8
        },
        {
          "lineHeight": {
            "type": "unit",
            "unit": "number",
            "value": 1
          }
        }
      ]
    },
    "borderRadius": {
      "none": {
        "type": "unit",
        "unit": "px",
        "value": 0
      },
      "sm": {
        "type": "unit",
        "unit": "rem",
        "value": 0.125
      },
      "DEFAULT": {
        "type": "unit",
        "unit": "rem",
        "value": 0.25
      },
      "md": {
        "type": "unit",
        "unit": "rem",
        "value": 0.375
      },
      "lg": {
        "type": "unit",
        "unit": "rem",
        "value": 0.5
      },
      "xl": {
        "type": "unit",
        "unit": "rem",
        "value": 0.75
      },
      "2xl": {
        "type": "unit",
        "unit": "rem",
        "value": 1
      },
      "3xl": {
        "type": "unit",
        "unit": "rem",
        "value": 1.5
      },
      "full": {
        "type": "unit",
        "unit": "px",
        "value": 9999
      }
    },
    "spacing": {
      "0": {
        "type": "unit",
        "unit": "px",
        "value": 0
      },
      "1": {
        "type": "unit",
        "unit": "rem",
        "value": 0.25
      },
      "2": {
        "type": "unit",
        "unit": "rem",
        "value": 0.5
      },
      "3": {
        "type": "unit",
        "unit": "rem",
        "value": 0.75
      },
      "4": {
        "type": "unit",
        "unit": "rem",
        "value": 1
      },
      "5": {
        "type": "unit",
        "unit": "rem",
        "value": 1.25
      },
      "6": {
        "type": "unit",
        "unit": "rem",
        "value": 1.5
      },
      "7": {
        "type": "unit",
        "unit": "rem",
        "value": 1.75
      },
      "8": {
        "type": "unit",
        "unit": "rem",
        "value": 2
      },
      "9": {
        "type": "unit",
        "unit": "rem",
        "value": 2.25
      },
      "10": {
        "type": "unit",
        "unit": "rem",
        "value": 2.5
      },
      "11": {
        "type": "unit",
        "unit": "rem",
        "value": 2.75
      },
      "12": {
        "type": "unit",
        "unit": "rem",
        "value": 3
      },
      "14": {
        "type": "unit",
        "unit": "rem",
        "value": 3.5
      },
      "16": {
        "type": "unit",
        "unit": "rem",
        "value": 4
      },
      "20": {
        "type": "unit",
        "unit": "rem",
        "value": 5
      },
      "24": {
        "type": "unit",
        "unit": "rem",
        "value": 6
      },
      "28": {
        "type": "unit",
        "unit": "rem",
        "value": 7
      },
      "32": {
        "type": "unit",
        "unit": "rem",
        "value": 8
      },
      "36": {
        "type": "unit",
        "unit": "rem",
        "value": 9
      },
      "40": {
        "type": "unit",
        "unit": "rem",
        "value": 10
      },
      "44": {
        "type": "unit",
        "unit": "rem",
        "value": 11
      },
      "48": {
        "type": "unit",
        "unit": "rem",
        "value": 12
      },
      "52": {
        "type": "unit",
        "unit": "rem",
        "value": 13
      },
      "56": {
        "type": "unit",
        "unit": "rem",
        "value": 14
      },
      "60": {
        "type": "unit",
        "unit": "rem",
        "value": 15
      },
      "64": {
        "type": "unit",
        "unit": "rem",
        "value": 16
      },
      "72": {
        "type": "unit",
        "unit": "rem",
        "value": 18
      },
      "80": {
        "type": "unit",
        "unit": "rem",
        "value": 20
      },
      "96": {
        "type": "unit",
        "unit": "rem",
        "value": 24
      },
      "px": {
        "type": "unit",
        "unit": "px",
        "value": 1
      },
      "0.5": {
        "type": "unit",
        "unit": "rem",
        "value": 0.125
      },
      "1.5": {
        "type": "unit",
        "unit": "rem",
        "value": 0.375
      },
      "2.5": {
        "type": "unit",
        "unit": "rem",
        "value": 0.625
      },
      "3.5": {
        "type": "unit",
        "unit": "rem",
        "value": 0.875
      }
    }
  }
