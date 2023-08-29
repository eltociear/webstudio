import { parseCssDecl } from "@webstudio-is/css-data";
import { WsEmbedTemplate, instanceToWsTemplate } from "@webstudio-is/react-sdk";
import vm from "node:vm";
import type { Model as BaseModel } from "../../models/types";
import { formatPrompt } from "../../utils/format-prompt";
import { getCode } from "../../utils/get-code";
import { type Chain, type ChainMessage } from "../types";
import { prompt as promptTemplate } from "./__generated__/tweak.prompt";
import { examples, wrapExample } from "./examples";

export const createChain = <ModelMessageFormat>(): Chain<
  BaseModel<ModelMessageFormat>
> =>
  async function chain({ model, context }) {
    const { prompts, messages, api, projectId, buildId, instanceId } = context;

    const build = await api.getBuild({ projectId, buildId });

    const instances = new Map(build.instances);
    const rootInstance = instances.get(instanceId);

    if (rootInstance === undefined) {
      throw new Error("Instance does not exist");
    }

    const template = instanceToWsTemplate({ build, instanceId });

    // console.log({ template });

    // Prepare prompt variables...
    if (prompts.components) {
      prompts.components = JSON.parse(prompts.components)
        .map((name: string) => `| "${name}"`)
        .join("\n");
    }

    prompts.selectedInstance =
      rootInstance.component === "Body"
        ? ""
        : `- The selectedInstance is a \`${rootInstance.component}\``;

    // const theme = getTheme(build.styles)
    const theme = { colorMode: "light" };

    prompts.theme = "";
    prompts.colorMode = theme.colorMode;

    const userMessage: ChainMessage = [
      "user",
      formatPrompt(prompts, promptTemplate),
    ];

    // console.log({ userMessage });

    const examplesMessages: ChainMessage[] = [
      ["user", "Here are some examples:"],
    ];

    Object.entries(examples).forEach(([user, assistant]) => {
      examplesMessages.push(["user", user]);
      examplesMessages.push(["assistant", wrapExample(assistant)]);
    });

    const requestMessages = model.generateMessages([
      ...messages,
      ...examplesMessages,
      userMessage,
    ]);

    const response = await model.request({
      messages: requestMessages,
    });

    if (response.success === false) {
      return response;
    }

    const message = response.choices[0];

    if (message === "") {
      return {
        success: false,
        type: "empty_response",
        status: 500,
        message: "",
      };
    }

    const fn = getCode(message, "javascript");

    if (fn === "") {
      return {
        success: false,
        type: "empty_response",
        status: 500,
        message: "",
      };
    }

    const sandbox = {
      instance: template[0],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parseStyle: function parseStyle(style: { property: any; value: string }) {
        const parsedCss = parseCssDecl(style.property, style.value);
        return Object.entries(parsedCss).map(([property, value]) => ({
          property,
          value,
        }));
      },
      import: () => {
        throw new Error("not supported");
      },
      require: () => {
        throw new Error("not supported");
      },
    };

    const script = new vm.Script(`(${fn})(instance, parseStyle)`);
    const ctx = vm.createContext(sandbox);
    const json = [script.runInContext(ctx)];

    try {
      // validate the modified template
      WsEmbedTemplate.parse(json);
    } catch (error) {
      return {
        success: false,
        type: "parsing_error",
        status: 500,
        message: "",
      };
    }

    return {
      success: true,
      llmMessages: [[...messages, ["assistant", message]]],
      code: [process.env.NODE_ENV !== "production" ? fn : ""],
      json: [json],
    };
  };
