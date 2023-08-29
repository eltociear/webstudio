import type { Model as BaseModel } from "../../models/types";
import { formatPrompt } from "../../utils/format-prompt";
import { getCode } from "../../utils/get-code";
import type { Chain, ChainMessage } from "../types";
import { prompt as promptTemplate } from "./__generated__/sections.prompt";

export const createChain = <ModelMessageFormat>(): Chain<
  BaseModel<ModelMessageFormat>
> =>
  async function chain({ model, context }) {
    const { prompts } = context;

    const requestMessage: ChainMessage = [
      "user",
      formatPrompt(prompts, promptTemplate),
    ];

    const response = await model.request({
      messages: model.generateMessages([requestMessage]),
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

    const code = getCode(message, "json");

    if (code === "") {
      return {
        success: false,
        type: "empty_response",
        status: 500,
        message: "",
      };
    }

    const parsed = JSON.parse(code);
    const json = (
      parsed.type === "full-page" && Array.isArray(parsed.sections)
        ? (parsed.sections as string[])
        : []
    ).map(
      (description) =>
        `We are working on the following project:\n${
          parsed.subject || prompts.request || ""
        }.\n\nAt this stage we want you to create the following part of the UI:\n${description}`
    );

    return {
      success: true,
      llmMessages: [[requestMessage, ["assistant", message]]],
      code: [code],
      json: [json],
    };
  };
