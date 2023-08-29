import type { Model as BaseModel } from "../../models/types";
import type { Chain } from "../types";
import template123 from "../../templates/123";
import template456 from "../../templates/456";
import { tokens } from "../../templates/tokens";
import { z } from "zod";
import { WsEmbedTemplate } from "@webstudio-is/react-sdk";
import { TokensSchema } from "../../templates/types";

export const createChain = <ModelMessageFormat>(): Chain<
  BaseModel<ModelMessageFormat>
> =>
  async function chain({ model, context }) {
    const json: Response = {
      tokens,
      blocks: [template123.template, template456.template],
    };

    return {
      success: true,
      llmMessages: [],
      code: [],
      json: [json],
    };
  };

export const ResponseSchema = z.object({
  tokens: TokensSchema,
  blocks: z.array(WsEmbedTemplate),
});

export type Response = z.infer<typeof ResponseSchema>;
