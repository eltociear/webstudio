import type { Model as BaseModel } from "../../models/types";

import { Theme } from "@webstudio-is/css-data";
import { formatPrompt } from "../../utils/format-prompt";
import { getCode } from "../../utils/get-code";
import { toTokensTheme } from "../../utils/theme";
import type { Chain, ChainMessage } from "../types";
import { prompt as promptSystemTemplate } from "./__generated__/customize.system.prompt";
import { prompt as promptUserTemplate } from "./__generated__/customize.user.prompt";
import { getTokens } from "../../utils/get-tokens";

const customizableProperties = new Set([
  "backgroundColor",
  "color",
  "borderRadius",
  "fontSize",
  "fontFamily",
]);

export const createChain = <ModelMessageFormat>(): Chain<
  BaseModel<ModelMessageFormat>
> =>
  async function chain({ model, context }) {
    const { prompts, api, projectId, buildId } = context;

    try {
      // eslint-disable-next-line no-var
      var theme = Theme.parse(JSON.parse(prompts.theme));
    } catch (error) {
      return {
        success: false,
        type: "parsing_error",
        status: 500,
        message: "Invalid theme",
      };
    }

    prompts.theme = JSON.stringify(
      toTokensTheme(theme, (property, value) =>
        customizableProperties.has(property)
      )
    );

    prompts.customizableProperties = [...customizableProperties]
      .map((value) => `"${value}"`)
      .join(" | ");

    const build = await api.getBuild({ projectId, buildId });

    const tokens: Record<string, string> = Object.fromEntries(
      getTokens(build)
        .map(({ id, name }) => [name, id])
        .filter(
          ([_, id]) =>
            id.startsWith("__ws:") === true &&
            id.startsWith("__override:__ws:") === false
        )
    );

    console.log(tokens, getTokens(build));

    prompts.tokens = Object.keys(tokens).join(",");

    const systemMessage: ChainMessage = [
      "system",
      formatPrompt(prompts, promptSystemTemplate),
    ];

    const requestMessage: ChainMessage = [
      "user",
      formatPrompt(prompts, promptUserTemplate),
    ];

    // console.log(systemMessage[1], requestMessage[1]);

    const messages = model.generateMessages([systemMessage, requestMessage]);

    const response = await model.request({
      messages,
    });

    if (response.success === false) {
      return response;
    }

    const message = response.choices[0];

    if (!message) {
      return {
        success: false,
        type: "empty_response",
        status: 500,
        message: "",
      };
    }

    const code = getCode(message, "json").trim();

    let json;

    try {
      // @todo parse with zod
      // {
      //   "Button": [
      //     "backgroundColor:backgroundColor.base",
      //     "color:color.base",
      //     "borderRadius:borderRadius.md"
      //   ],
      //   "Heading": ["fontSize:fontSize.3xl", "color:color.accent"],
      //   "Image": ["borderRadius:borderRadius.md"]
      // }
      json = (Object.entries(JSON.parse(code)) as Array<[string, string[]]>)
        .map(([name, styles]) =>
          tokens[name]
            ? {
                id: tokens[name],
                name,
                styles,
              }
            : null
        )
        .filter(function <T>(value: T): value is NonNullable<T> {
          return value !== null;
        });

      console.log(tokens, json);
    } catch (error) {
      return {
        success: false,
        type: "parsing_error",
        status: 500,
        message: code,
      };
    }

    return {
      success: true,
      llmMessages: [[requestMessage, ["assistant", message]]],
      code: [code],
      json: [json],
    };
  };
