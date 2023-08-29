import {
  Box,
  Button,
  Dialog,
  DialogContent,
  Flex,
  IconButton,
  Label,
  Text,
  TextArea,
  theme,
} from "@webstudio-is/design-system";

import {
  instancesStore,
  projectStore,
  registeredComponentMetasStore,
  selectedInstanceSelectorStore,
  selectedInstanceStore,
} from "~/shared/nano-states";

import { EyeconOpenIcon, SpinnerIcon } from "@webstudio-is/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Publish } from "~/shared/pubsub";
import { aiPath } from "~/shared/router-utils";
import { CloseButton, Header } from "../../header";
import type { TabName } from "../../types";

import {
  type EmbedTemplateProp,
  type EmbedTemplateStyleDecl,
  type WsEmbedTemplate,
} from "@webstudio-is/react-sdk";

import { useStore } from "@nanostores/react";
import type { ErrorResponse, SuccessResponse, Theme } from "@webstudio-is/ai";
import { formData } from "zod-form-data";
import { FloatingPanel } from "~/builder/shared/floating-panel";
import {
  deleteInstance,
  findClosestDroppableTarget,
  findSelectedInstance,
  insertTemplate,
  // replaceTemplate,
} from "~/shared/instance-utils";

type TabContentProps = {
  onSetActiveTab: (tabName: TabName) => void;
  publish: Publish;
};

type AIGenerationState =
  | {
      state: "idle";
    }
  | {
      state: "generating";
      step: AIGenerationSteps;
      progress: number;
    };

// @todo Rewrite the type definitions below
// so that when merged the result's type is correctly inferred as WsEmbedTemplate.
type EmbedTemplateStyles = {
  styles: EmbedTemplateStyleDecl[];
  children: EmbedTemplateStyles[];
};
type EmbedTemplateProps = {
  props: EmbedTemplateProp[];
  children: EmbedTemplateProps[];
};

type AIActionGenerate = {
  type: "generate";
  step:
    | {
        type: "theme";
        response: SuccessResponse<"theme">;
      }
    | {
        type: "sections";
        response: SuccessResponse<"sections">;
      }
    | {
        type: "ui";
        response: SuccessResponse<"ui">;
      };
};

type AIActionEdit = {
  type: "edit";
  step: {
    type: "tweak";
    response: string;
  };
};

type AIAction = AIActionGenerate | AIActionEdit;

const messages: Record<
  AIActionGenerate["type"],
  Record<AIActionGenerate["step"]["type"], string>
> &
  Record<AIActionEdit["type"], Record<AIActionEdit["step"]["type"], string>> = {
  generate: {
    theme: "Generating a theme",
    sections: "Processing information",
    ui: "Making magic",
  },
  edit: {
    tweak: "Tweaking",
  },
};

const onAIComplete = {
  generate: {
    ui: ({
      template,
      instanceId,
      index,
    }: {
      template: WsEmbedTemplate;
      instanceId: string;
      index: number;
    }) => {
      const selectedInstanceSelector = selectedInstanceSelectorStore.get();

      if (
        !selectedInstanceSelector ||
        selectedInstanceSelector[0] !== instanceId
      ) {
        throw new Error("Invalid selected instance");
      }

      const dropTarget = findClosestDroppableTarget(
        registeredComponentMetasStore.get(),
        instancesStore.get(),
        selectedInstanceSelector,
        []
      );

      if (dropTarget) {
        dropTarget.position = index;
        insertTemplate(template, dropTarget);

        selectedInstanceSelectorStore.set([
          instanceId,
          ...dropTarget.parentSelector,
        ]);
      } else {
        throw new Error("Invalid selected instance");
      }
    },
    theme: () => {
      /*noop*/
    },
    sections: () => {
      /*noop*/
    },
  },
  edit: {
    tweak: ({
      template,
      instanceId,
    }: {
      template: WsEmbedTemplate;
      instanceId: string;
    }) => {
      const selectedInstanceSelector = selectedInstanceSelectorStore.get();

      if (
        !selectedInstanceSelector ||
        selectedInstanceSelector[0] !== instanceId
      ) {
        // eslint-disable-next-line no-console
        console.log("Invalid selected instance");
        return;
      }

      // replaceTemplate(template, selectedInstanceSelector);
    },
  },
};

export const TabContent = ({ publish, onSetActiveTab }: TabContentProps) => {
  const [aiGenerationState, setAiGenerationState] = useState<AIGenerationState>(
    { state: "idle" }
  );

  const [generation, setGeneration] = useState<{
    url: string;
    baseData: FormData;
  }>(null);

  const aiTheme = useRef<Theme | null>(null);
  const aiAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (generation === null) {
      return;
    }
    aiAbort.current = new AbortController();
    const signal = aiAbort.current.signal;

    const { url, baseData } = generation;

    const run = async function run() {
      let existingTheme = aiTheme.current;
      let sectionsPrompt;

      console.log({ existingTheme });

      const sectionsFormData = getBaseFormData(baseData, "sections");
      const sectionsRequest = retry(
        () =>
          request<"sections">(url, {
            method: "POST",
            body: sectionsFormData,
            signal,
          }),
        2,
        30000
      );

      let themeRequest = Promise.resolve({
        success: true,
        response: {
          step: "theme",
          json: existingTheme,
        },
      });

      if (existingTheme === null) {
        setAiGenerationState({
          state: "generating",
          step: "theme",
          progress: 0,
        });

        const themeFormData = getBaseFormData(baseData, "theme");
        themeRequest = request<"theme">(url, {
          method: "POST",
          body: themeFormData,
          signal,
        });
      }

      [existingTheme, sectionsPrompt] = await Promise.all([
        themeRequest,
        sectionsRequest,
      ]);

      // console.log({ sectionsPrompt });

      if (existingTheme === null || existingTheme instanceof Error) {
        setAiGenerationState({
          state: "idle",
        });
        return;
      }

      aiTheme.current = existingTheme;

      setAiGenerationState({
        state: "generating",
        step: "page",
        progress: 35,
      });

      const userPrompt = baseData.get("prompt");
      const prompts =
        sectionsPrompt.type === "full-page" &&
        Array.isArray(sectionsPrompt.sections)
          ? sectionsPrompt.sections.map(
              (prompt) =>
                // `We are working on the following project:\n${sectionsPrompt.subject}.\n\nThe overall project details:\n${userPrompt}\n\nAt this stage we want you to create the following part of the UI:\n${prompt}`
                `We are working on the following project:\n${sectionsPrompt.subject}.\n\nAt this stage we want you to create the following part of the UI:\n${prompt}`
            )
          : [sectionsPrompt.subject || userPrompt];

      console.log(prompts.join("\n------------------------\n"));

      const indexMap: number[] = [];
      const getIndexForInsertion = function getIndexForInsertion(
        indexMap: number[],
        currentIndex: number
      ) {
        const previousIndexes = indexMap.filter(
          (index) => index < currentIndex
        );
        return previousIndexes.length;
      };

      const generationPromises = prompts.map((prompt, index) => {
        // console.log(`Generating section ${index}: ${prompt}`);

        const pageFormData = getBaseFormData(baseData, "page");
        pageFormData.append("theme", JSON.stringify(existingTheme));
        pageFormData.delete("prompt");
        pageFormData.append("prompt", prompt);

        return retry(() =>
          request(url, {
            method: "POST",
            body: pageFormData,
            signal,
          })
        ).then((template) => {
          if (template) {
            console.log(`Section ${index} OK.`, template);
            const insertIndex = getIndexForInsertion(indexMap, index);
            indexMap[index] = insertIndex;
            onAIComplete.generateSection(
              template,
              pageFormData.get("instanceId"),
              insertIndex
            );
            return template;
          } else {
            return null;
          }
        });
      });

      await Promise.all(generationPromises);
      setAiGenerationState({
        state: "idle",
      });
    };

    run();

    return () => {
      aiAbort.current?.abort();
    };
  }, [generation]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (aiGenerationState.state !== "idle") {
      return;
    }

    const form = event.currentTarget as HTMLFormElement;
    const baseData = new FormData(form);

    const submitter = event.submitter || document.activeElement;

    const isEdit =
      submitter && submitter.name === "_action"
        ? submitter.value === "edit"
        : false;

    const action: AIAction = isEdit ? "edit" : "generate";
    baseData.append("_action", action);

    const instance = selectedInstanceStore.get();
    const project = projectStore.get();

    if (!instance || !project) {
      return;
    }

    baseData.append("instanceId", instance.id);
    baseData.append("projectId", project.id);

    setGeneration({
      url: form.action,
      baseData,
    });
  };

  const metas = useStore(registeredComponentMetasStore);

  const components = useMemo(() => {
    const exclude = ["Body", "Slot"];
    return JSON.stringify(
      [...metas.keys()].filter((name) => !exclude.includes(name))
    );
  }, [metas]);

  return (
    <>
      <Flex css={{ height: "100%", flexDirection: "column" }}>
        <Header
          title="AI Generation"
          suffix={<CloseButton onClick={() => onSetActiveTab("none")} />}
        />
        <Flex gap="2" wrap="wrap" css={{ p: theme.spacing[9] }}>
          <form method="POST" action={aiPath()} onSubmit={handleSubmit}>
            <Label htmlFor="ai-prompt">Prompt</Label>
            <TextArea
              name="prompt"
              id="ai-prompt"
              maxLength={1380}
              required
              disabled={aiGenerationState.state !== "idle"}
            />
            <input type="hidden" name="components" value={components} />
            <Box css={{ display: "flex", gap: theme.spacing[2] }}>
              <Button
                css={{ width: "100%" }}
                disabled={aiGenerationState.state !== "idle"}
                name="_action"
                value="edit"
                type="submit"
                // onClick={(e) => {
                //   e.preventDefault();
                //   const instance = selectedInstanceStore.get();
                //   if (instance) {
                //     onAIComplete.edit(
                //       [
                //         {
                //           step: "tweak",
                //           response: { code: "", json: template },
                //         },
                //       ],
                //       instance.id
                //     );
                //   }
                // }}
              >
                Edit
              </Button>
              <Button
                css={{ width: "100%" }}
                disabled={aiGenerationState.state !== "idle"}
                name="_action"
                value="generate"
                type="submit"
              >
                Generate
              </Button>
            </Box>
          </form>
        </Flex>
      </Flex>

      {aiGenerationState.state !== "idle" ? (
        <Flex
          css={{
            position: "fixed",
            top: theme.spacing[12],
            left: "50%",
            transform: "translateX(-50%)",
            width: "100%",
            maxWidth: 300,
            padding: theme.spacing[8],
            borderRadius: theme.borderRadius[6],
            backdropFilter: "blur(5px)",
            backgroundColor: theme.colors.whiteA11,
            boxShadow: theme.shadows.brandElevationBig,
          }}
          direction="column"
          gap="2"
          justify="center"
          align="center"
        >
          <Box css={{ widht: "70%" }}>
            <Text>🪄 {messages[aiGenerationState.step]}...</Text>
          </Box>
          <Button
            css={{ widht: "70%" }}
            onClick={() => {
              if (window.confirm("Are you sure you want to abort?")) {
                aiAbort.current?.abort();
              }
            }}
          >
            <Flex gap="2">
              <SpinnerIcon />
              STOP
            </Flex>
          </Button>
        </Flex>
      ) : // <Dialog defaultOpen={true}>
      //   <DialogContent
      //     // @todo Add ability to abort generation requests.
      //     onInteractOutside={(event) => {
      //       event.preventDefault();
      //     }}
      //     onEscapeKeyDown={(event) => {
      //       event.preventDefault();
      //     }}
      //   >
      //     <Flex
      //       gap="2"
      //       css={{ flexDirection: "column", p: theme.spacing[9] }}
      //     >
      //       <Text>🪄 {labels[aiGenerationState.step]}...</Text>
      //       <progress
      //         value={aiGenerationState.progress}
      //         max="100"
      //         style={{ width: "100%" }}
      //       >
      //         {aiGenerationState.progress}%
      //       </progress>
      //     </Flex>
      //   </DialogContent>
      // </Dialog>
      null}
    </>
  );
};

export const icon = <EyeconOpenIcon />;

const request = function request<Step>(...args: Parameters<typeof fetch>) {
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
    })) as Promise<SuccessResponse<Step> | ErrorResponse>;
};

const retry = function retry<T>(
  fn: () => Promise<T> | T,
  times = 3,
  timeout = 45000
): Promise<T | null> | T {
  const result = fn();
  if (result instanceof Promise) {
    return result.then((value) => {
      if (value instanceof Error) {
        return null;
      }
      return value === null && times > 0 ? retry(fn, times - 1) : value;
    });
  }
  return result === null && times > 0 ? retry(fn, times - 1) : result;
};

const getBaseFormData = function getBaseFormData(
  baseData: FormData,
  step: string
) {
  const formData = new FormData();

  for (const [key, value] of baseData.entries()) {
    formData.append(key, value);
  }

  formData.append("steps", step);
  return formData;
};

// onClick={(e) => {
//   e.preventDefault();
//   const instance = selectedInstanceStore.get();
//   if (instance) {
//     onAIComplete.edit(
//       [
//         {
//           step: "tweak",
//           response: { code: "", json: template },
//         },
//       ],
//       instance.id
//     );
//   }
// }}
const template = [
  {
    type: "instance",
    component: "Heading",
    children: [
      {
        type: "text",
        value: "Welcome to Stripe",
      },
    ],
    styles: [
      {
        property: "fontSize",
        value: {
          type: "unit",
          unit: "px",
          value: 48,
        },
      },
      {
        property: "fontWeight",
        value: {
          type: "keyword",
          value: "bold",
        },
      },
      {
        property: "marginBottom",
        value: {
          type: "unit",
          unit: "px",
          value: 20,
        },
      },
      // {
      //   property: "color",
      //   value: {
      //     type: "rgb",
      //     alpha: 1,
      //     r: 255,
      //     g: 0,
      //     b: 0,
      //   },
      // },
      {
        property: "color",
        value: {
          type: "rgb",
          alpha: 1,
          r: 0,
          g: 0,
          b: 255,
        },
      },
    ],
  },
];
