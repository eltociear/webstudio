import { WsEmbedTemplate } from "@webstudio-is/react-sdk";
import { base as componentsStyles } from "../../components/base";
import type { Model as BaseModel } from "../../models/types";

import { Theme } from "@webstudio-is/css-data";
import { formatPrompt } from "../../utils/format-prompt";
import { getCode } from "../../utils/get-code";
import {
  collectDescriptions,
  generateImagesUrlsUnsplash,
  insertImagesUrls,
} from "../../utils/images";
import { jsxToWSEmbedTemplate } from "../../utils/jsx";
import { toRawTheme } from "../../utils/theme";
import { traverseTemplate } from "../../utils/traverse-template";
import type { Chain, ChainMessage } from "../types";
import { prompt as promptSystemTemplate } from "./__generated__/ui.system.prompt";
import { prompt as promptUserTemplate } from "./__generated__/ui.user.prompt";

export const createChain = <ModelMessageFormat>(): Chain<
  BaseModel<ModelMessageFormat>
> =>
  async function chain({ model, context }) {
    const { prompts } = context;

    if (prompts.components) {
      prompts.components = (JSON.parse(prompts.components) as string[])
        .map((componentName, index) => {
          const variants = Object.keys(
            componentsStyles[componentName] || {}
          ).filter((v) => v !== "base");
          if (variants.length > 0) {
            return `- ${componentName}: ${variants.join(", ")}`;
          }
          return `- ${componentName}`;
        })
        .join("\n");
    }

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

    prompts.theme = JSON.stringify(toRawTheme(theme));

    const systemMessage: ChainMessage = [
      "system",
      formatPrompt(prompts, promptSystemTemplate),
    ];

    const requestMessage: ChainMessage = [
      "user",
      formatPrompt(prompts, promptUserTemplate),
    ];

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

    const jsx = getCode(message, "jsx").trim();

    if (
      jsx === "" ||
      jsx.startsWith("<") === false ||
      jsx.endsWith(">") === false
    ) {
      // console.log(response);
      return {
        success: false,
        type: "invalid_model_response",
        status: 500,
        message: "",
      };
    }

    let json: WsEmbedTemplate;

    try {
      json = jsxToWSEmbedTemplate(jsx);
      WsEmbedTemplate.parse(json);
      resolveStyles(json, theme);
    } catch (error) {
      return {
        success: false,
        type: "parsing_error",
        status: 500,
        message: jsx,
      };
    }

    // Insert generated images.
    try {
      const descriptions = collectDescriptions(json);
      const imageUrls = await generateImagesUrlsUnsplash(descriptions);
      insertImagesUrls(json, descriptions, imageUrls);
    } catch (error) {
      /* if image extraction fails we should continue regardless */
    }

    try {
      // validate the template
      WsEmbedTemplate.parse(json);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        // console.log(JSON.stringify(json));
        // console.error(error);
      }
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
      code: [jsx],
      json: [json],
    };
  };

const resolveStyles = function resolveStyles(
  json: WsEmbedTemplate,
  theme: Theme
) {
  traverseTemplate(json, (node) => {
    if (node.type === "instance") {
      const variants = ["base"];
      if (node.props) {
        node.props = node.props.filter((prop) => {
          if (prop.name === "variants") {
            variants.push(...(prop.value as string[]));
            return false;
          }
          return true;
        });
      }

      const componentStyles = componentsStyles[node.component];
      if (variants.length > 0 && componentStyles !== undefined) {
        if (node.styles == null) {
          node.styles = [];
        }
        const applied = new Set(
          node.styles.map((styleDecl) => styleDecl.property)
        );
        variants
          .reverse()
          .flatMap((variant) =>
            componentStyles[variant] ? componentStyles[variant](theme) : []
          )
          .forEach((styleDecl) => {
            if (node.styles == null) {
              node.styles = [];
            }

            if (applied.has(styleDecl.property) === false) {
              applied.add(styleDecl.property);
              node.styles.push(styleDecl);
            } else if (
              styleDecl.property === "backgroundImage" &&
              styleDecl.value.type !== "invalid"
            ) {
              // Merge layers.
              //
              // {
              //   property: "backgroundImage",
              //   value: {
              //     type: "layers",
              //     value: [
              //       {
              //         type: "image",
              //         value: {
              //           type: "asset",
              //           value: "https://url..."
              //         },
              //       },
              //     ],
              //   },
              // }

              const backgroundImageIndex = node.styles.findIndex(
                (decl) => decl.property === "backgroundImage"
              );
              const declValue =
                backgroundImageIndex > -1
                  ? node.styles[backgroundImageIndex]?.value
                  : null;

              if (declValue && declValue.type === "invalid") {
                node.styles[backgroundImageIndex] = styleDecl;
              } else if (
                backgroundImageIndex > -1 &&
                declValue &&
                declValue.type === "layers" &&
                styleDecl.value.type === "layers"
              ) {
                declValue.value.push(...styleDecl.value.value);
                node.styles[backgroundImageIndex] = {
                  property: "backgroundImage",
                  value: declValue,
                };
              } else {
                applied.add(styleDecl.property);
                node.styles.push(styleDecl);
              }
            }
          });
      }
    }
  });
};
