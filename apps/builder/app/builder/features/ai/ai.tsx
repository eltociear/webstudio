import {
  Box,
  Button,
  Card,
  Dialog,
  DialogContent,
  Flex,
  IconButton,
  Text,
  TextArea,
  theme,
} from "@webstudio-is/design-system";
import { request, retry } from "./request";
import { useStore } from "@nanostores/react";
import {
  projectStore,
  rootInstanceStore,
  selectedInstanceSelectorStore,
  selectedInstanceStore,
  styleSourcesStore,
} from "~/shared/nano-states";
import { useEffect, useRef, useState } from "react";
import type { Theme } from "@webstudio-is/css-data";
import type { StyleDecl, StyleSource } from "@webstudio-is/project-build";
import delve from "dlv";

import { aiPath } from "~/shared/router-utils";
import type {
  EmbedTemplateStyleDecl,
  WsEmbedTemplate,
} from "@webstudio-is/react-sdk";
import type { Entries } from "type-fest";
import { addTokensToInstances, createTokens } from "./utils";
import type { scaffold } from "@webstudio-is/ai";
import { insertTemplate } from "~/shared/instance-utils";

type Token = { id: string; name: string; styles: EmbedTemplateStyleDecl[] };
type Tokens = Token[];

type Steps = {
  sections_prompts: string[];
  scaffold: scaffold.Response;
  theme: Theme;
  customize: { id: string; name: string; styles: string[] }[];
  copy: { id: string; text: string }[];
  images: { id: string; url: string; alt: string }[];
};

type Step = keyof Steps;

type Callbacks<T extends Step> = {
  [K in T]: (
    response: Steps[K],
    data: Partial<Steps>,
    setData: React.Dispatch<React.SetStateAction<Partial<Steps>>>
  ) => Promise<void>;
};

const callbacks: Callbacks<Step> = {
  sections_prompts: async (response, data, setData) => {},
  scaffold: async (response, data, setData) => {
    const { tokens, blocks } = response;
    const rootInstance = rootInstanceStore.get();
    if (rootInstance === undefined) {
      alert("No root instance found");
      return;
    }

    createTokens(tokens);

    const shouldAddToken = new Set(tokens.map(({ id }) => id));

    blocks.forEach((block) => {
      // Append next block as child of rootInstance. We can make this configurable in the future.
      selectedInstanceSelectorStore.set([rootInstance.id]);

      // @todo Template should pick up existing tokens by ID.
      insertTemplate(block);

      // const selectedInstanceSelector = selectedInstanceSelectorStore.get();

      // addTokensToInstances(
      //   selectedInstanceSelector
      //     ? selectedInstanceSelector[0]
      //     : rootInstance.id,
      //   tokens,
      //   (instance, id, styleSourceSelection) =>
      //     // instance.id !== rootInstance.id &&
      //     shouldAddToken.has(id) &&
      //     styleSourceSelection.values.includes(id) === false
      // );
    });
  },
  theme: async (response, data, setData) => {},
  customize: async (tokensOverrides, data, setData) => {
    const { theme } = data;

    if (theme === undefined) {
      // @todo perhaps setData error to notify in the UI.
      alert("Theme not found");
      return;
    }

    const styleSources: Extract<StyleSource, { type: "token" }>[] = [];

    for (const styleSource of styleSourcesStore.get().values()) {
      if (styleSource.type === "token") {
        styleSources.push(styleSource);
      }
    }

    const tokens: Tokens = tokensOverrides.map(({ id, name, styles }) => {
      const resolvedStyles = styles
        .map((style) => {
          const [property, ...themeValue] = style.split(":");
          if (property === undefined || themeValue.length !== 0) {
            return null;
          }
          const value = delve(theme, themeValue, null);
          if (value === null) {
            return;
          }

          return {
            property,
            value,
          } as EmbedTemplateStyleDecl;
        })
        .filter(function <T>(value: T): value is NonNullable<T> {
          return value !== null;
        });

      return {
        id: `__override:${id}`,
        name,
        styles: resolvedStyles,
      };
    });

    createTokens(tokens);

    const selectedInstanceSelector = selectedInstanceSelectorStore.get();

    if (
      selectedInstanceSelector === undefined ||
      typeof selectedInstanceSelector[0] !== "string"
    ) {
      alert("No selected instance");
      return;
    }

    const shouldAddToken = new Set(tokensOverrides.map(({ id }) => id));
    addTokensToInstances(
      selectedInstanceSelector[0],
      tokens,
      (instance, id, styleSourceSelection) =>
        // shouldAddToken.has(id) &&
        styleSourceSelection.values.includes(id.replace("__override:", "")) ===
        true
    );

    // const customizableTokens = new Set(
    //   styleSources.map((styleSource) => styleSource.name)
    // );

    // const newTokens: Tokens = {};

    // for (const tokenName in tokensOverrides) {
    //   if (customizableTokens.has(tokenName) === false) {
    //     continue;
    //   }

    //   const styleDecls = tokensOverrides[tokenName]
    //     .map((themeOverride) => {
    //       const [property, ...themeValue] = themeOverride.split(":");
    //       if (property === undefined || themeValue.length !== 0) {
    //         return null;
    //       }
    //       const value = delve(theme, themeValue, null);
    //       if (value === null) {
    //         return;
    //       }
    //       return {
    //         styleSourceId: "",
    //         breakpointId: "",
    //         property,
    //         value,
    //       } as StyleDecl;
    //     })
    //     .filter(function <T>(value: T): value is NonNullable<T> {
    //       return value !== null;
    //     });

    //   if (styleDecls.length > 0) {
    //     newTokens[tokenName] = styleDecls;
    //   }
    // }

    // // console.log({ newTokens });
    // const selectedInstanceSelector = selectedInstanceSelectorStore.get();

    // if (
    //   selectedInstanceSelector === undefined ||
    //   typeof selectedInstanceSelector[0] !== "string"
    // ) {
    //   alert("No selected instance");
    //   return;
    // }

    // addTokensToInstances(selectedInstanceSelector[0], newTokens);
  },
  copy: async (response, data, setData) => {},
  images: async (response, data, setData) => {},
};

type StepsSerial = Step[];

// Split prompt in section descriptions with AI (optional).
const sectionsPromptsStep: Array<Step | StepsSerial> = ["sections_prompts"];
// Scaffold sections with information above.
const scaffoldingSteps: Array<Step | StepsSerial> = ["scaffold"];
// Customize sections.
const customizationSteps: Array<Step | StepsSerial> = [
  ["theme", "customize"],
  // "copy",
  // "images",
];

export const AI = ({ onDone }: { onDone?: () => void }) => {
  const [steps, setSteps] = useState<
    | { id: "scaffolding"; message: string; steps: typeof scaffoldingSteps }
    | { id: "customization"; message: string; steps: typeof customizationSteps }
  >({
    id: "customization",
    message: "Customizing",
    steps: customizationSteps,
  });
  // ({ id: "scaffolding", message: "Scaffolding", steps: scaffoldingSteps });

  const formRef = useRef<HTMLFormElement>();
  const [isPending, setIsPending] = useState<boolean>(false);
  const [resData, setResData] = useState<Partial<Steps>>({});
  const resDataRef = useRef<typeof resData>({});

  const selectedInstance = useStore(selectedInstanceStore);
  const project = useStore(projectStore);

  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    resDataRef.current = resData;

    // setTimeout(
    //   () =>
    //     insertTemplate([
    //       {
    //         type: "instance",
    //         component: "Box",
    //         children: [
    //           {
    //             type: "instance",
    //             component: "Heading",
    //             children: [
    //               {
    //                 type: "text",
    //                 value: "Heading you can edit",
    //               },
    //             ],
    //             tokens: ["__ws:9472fjSBwwpMNKt2N7Agy"],
    //           },
    //           {
    //             type: "instance",
    //             component: "Box",
    //             children: [
    //               {
    //                 type: "instance",
    //                 component: "Text",
    //                 children: [
    //                   {
    //                     type: "text",
    //                     value: "The text you can edit",
    //                   },
    //                 ],
    //               },
    //             ],
    //             tokens: ["__ws:Lrw4EqJBcIsDXIgMv6Y3U"],
    //           },
    //         ],
    //         tokens: [
    //           "__ws:uqkQ_F2YxSqn6Y__TxMe6",
    //           "__ws:OCPsSiwt53JCmwS7oQaAF",
    //         ],
    //       },
    //     ]),
    //   3000
    // );
  }, [resData]);

  useEffect(() => {
    if (isPending === false) {
      return;
    }

    abort.current = new AbortController();
    const signal = abort.current.signal;

    const parallelSteps = steps.steps.map((step) =>
      Array.isArray(step) ? step : [step]
    );

    Promise.all(
      parallelSteps.map(async (sequentialSteps) => {
        for (let i = 0; i < sequentialSteps.length; i++) {
          const step = sequentialSteps[i];

          if (resDataRef.current[step] !== undefined) {
            // Already processed.
            continue;
          }

          const formData = new FormData(formRef.current);
          formData.append("steps", step);

          type CurrentStepName = typeof step;
          type ResponseData = Steps[CurrentStepName];

          const result = await retry<CurrentStepName, [ResponseData]>(() =>
            request<CurrentStepName, [ResponseData]>(aiPath(), {
              method: "POST",
              body: JSON.stringify(Object.fromEntries(formData.entries())),
              signal,
            })
          );

          if (result.success === false) {
            console.log(step, " failed");
            continue;
          }

          const resData = result.responses[0].json[0];

          setResData({
            ...resDataRef.current,
            [step]: resData,
          });

          // @todo This could be better engineered.
          // @todo fix resData type inference with discriminated unions or something.
          callbacks[step](resData, resDataRef.current, setResData);
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
      })
    ).then(() => {
      abort.current = null;

      if (steps.id === "scaffolding") {
        // Continue with customization.
        // setSteps({
        //   id: "customization",
        //   message: "Customizing",
        //   steps: customizationSteps,
        // });
        setIsPending(false);
      } else {
        // Done.
        setIsPending(false);
      }
    });

    return () => {
      abort.current?.abort();
      abort.current = null;
    };
  }, [isPending, steps]);

  return (
    <Dialog open={true}>
      <DialogContent
        css={{
          border: "none",
          backgroundColor: "transparent",
          boxShadow: "none",
          maxWidth: "100%",
          overflowY: "auto",
          width: 600,
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
          <form
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault();
              setIsPending(true);
            }}
          >
            <TextArea
              name="prompt"
              defaultValue={testPrompt}
              required
              autoFocus
            />
            <input type="hidden" name="_action" value="generate" />
            {selectedInstance === undefined ? null : (
              <input
                type="hidden"
                name="instanceId"
                value={selectedInstance.id}
              />
            )}
            {project === undefined ? null : (
              <input type="hidden" name="projectId" value={project.id} />
            )}
            {(Object.entries(resData) as Entries<typeof resData>).map(
              ([step, data]) => (
                <input
                  type="hidden"
                  name={step}
                  value={JSON.stringify(data)}
                  key={step}
                />
              )
            )}
            {isPending ? (
              <Button
                onClick={() => {
                  abort.current?.abort();
                }}
              >
                abort {steps.message}
              </Button>
            ) : (
              <Button>Go {steps.message}</Button>
            )}
          </form>
          <Button
            onClick={() => {
              if (isPending) {
                abort.current?.abort();
              }
              if (onDone) {
                onDone();
              }
            }}
          >
            {isPending ? "abort & " : ""}close
          </Button>
        </Card>
      </DialogContent>
    </Dialog>
  );
};

const testPrompt = `Design a calming and user-friendly landing page for a holistic Yoga studio, focusing on offering Yoga classes and courses for all, run by a certified Yoga instructor. Reflect the universal accessibility of yoga and the expertise of the instructor through the website's design and layout.`;
