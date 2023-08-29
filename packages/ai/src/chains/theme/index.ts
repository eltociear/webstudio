import { Theme } from "@webstudio-is/css-data";
import type { Model as BaseModel } from "../../models/types";
import { formatPrompt } from "../../utils/format-prompt";
import { getCode } from "../../utils/get-code";
import { ThemeRaw, fromRawTheme } from "../../utils/theme";
import type { Chain, ChainMessage } from "../types";
import { types } from "./__generated__/prompt-theme-types";
import { prompt as promptTemplate } from "./__generated__/theme.prompt";

export const createChain = <ModelMessageFormat>(): Chain<
  BaseModel<ModelMessageFormat>
> =>
  async function chain({ model, context }) {
    const { prompts } = context;

    prompts.types = types;

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

    const json = getCode(message, "json");

    if (json === "") {
      return {
        success: false,
        type: "empty_response",
        status: 500,
        message: "",
      };
    }

    try {
      // eslint-disable-next-line no-var
      var theme = fromRawTheme({
        ...themeDefaults,
        ...JSON.parse(json),
      });

      Theme.parse(theme);
    } catch (error) {
      return {
        success: false,
        type: "parsing_error",
        status: 500,
        message: JSON.stringify(json, null, 2),
      };
    }

    return {
      success: true,
      llmMessages: [[requestMessage, ["assistant", message]]],
      code: [JSON.stringify(theme)],
      json: [theme],
    };
  };

export const themeDefaults: Pick<
  ThemeRaw,
  "fontSize" | "borderRadius" | "spacing"
> = {
  fontSize: {
    xs: ["0.75rem", { lineHeight: "1rem" }],
    sm: ["0.875rem", { lineHeight: "1.25rem" }],
    base: ["1rem", { lineHeight: "1.5rem" }],
    lg: ["1.125rem", { lineHeight: "1.75rem" }],
    xl: ["1.25rem", { lineHeight: "1.75rem" }],
    "2xl": ["1.5rem", { lineHeight: "2rem" }],
    "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
    "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
    "5xl": ["3rem", { lineHeight: "1" }],
    "6xl": ["3.75rem", { lineHeight: "1" }],
    "7xl": ["4.5rem", { lineHeight: "1" }],
    "8xl": ["6rem", { lineHeight: "1" }],
    "9xl": ["8rem", { lineHeight: "1" }],
  },
  borderRadius: {
    none: "0px",
    sm: "0.125rem",
    DEFAULT: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.75rem",
    "2xl": "1rem",
    "3xl": "1.5rem",
    full: "9999px",
  },
  spacing: {
    px: "1px",
    0: "0px",
    0.5: "0.125rem",
    1: "0.25rem",
    1.5: "0.375rem",
    2: "0.5rem",
    2.5: "0.625rem",
    3: "0.75rem",
    3.5: "0.875rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    7: "1.75rem",
    8: "2rem",
    9: "2.25rem",
    10: "2.5rem",
    11: "2.75rem",
    12: "3rem",
    14: "3.5rem",
    16: "4rem",
    20: "5rem",
    24: "6rem",
    28: "7rem",
    32: "8rem",
    36: "9rem",
    40: "10rem",
    44: "11rem",
    48: "12rem",
    52: "13rem",
    56: "14rem",
    60: "15rem",
    64: "16rem",
    72: "18rem",
    80: "20rem",
    96: "24rem",
  },
};
