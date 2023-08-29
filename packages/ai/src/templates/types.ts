import {
  WsEmbedTemplate,
  EmbedTemplateStyleDecl,
} from "@webstudio-is/react-sdk";

import { z } from "zod";

export const TemplateSchema = z.object({
  name: z.string(),
  dscription: z.string(),
  template: WsEmbedTemplate,
});

export type Template = z.infer<typeof TemplateSchema>;

export const TokensSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    styles: z.array(EmbedTemplateStyleDecl),
  })
);

export type Tokens = z.infer<typeof TokensSchema>;
