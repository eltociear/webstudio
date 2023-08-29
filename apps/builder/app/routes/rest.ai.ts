import type { ActionArgs } from "@remix-run/node";

import {
  createGptModel,
  type ChainContext,
  type ErrorResponse,
  type GPTModelMessageFormat,
  type SuccessResponse,
  scaffold,
  theme,
  customize,
} from "@webstudio-is/ai";
import { isFeatureEnabled } from "@webstudio-is/feature-flags";
import { prisma } from "@webstudio-is/prisma-client";
import {
  loadBuildByProjectId,
  parseBuild,
} from "@webstudio-is/project-build/index.server";
import { authorizeProject } from "@webstudio-is/trpc-interface/index.server";
import { z } from "zod";
import { zfd } from "zod-form-data";
import env from "~/env/env.server";
import { createContext } from "~/shared/context.server";

const StepSchema = z.enum(["theme", "sections", "ui", "scaffold", "customize"]);

const RequestSchema = zfd.formData(
  z.object({
    prompt: zfd.text(z.string().max(3380)),
    components: zfd.text(z.string().optional()).optional(),
    theme: zfd.text(z.string().optional()).optional(),
    messages: zfd.repeatableOfType(zfd.text()).optional(),
    instanceId: zfd.text(),
    projectId: zfd.text(),
    buildId: zfd.text().optional(),
    _action: zfd.text(z.enum(["generate"])),
    steps: zfd.repeatableOfType(StepSchema),
  })
);

const chains = {
  generate: {
    scaffold: scaffold.createChain<GPTModelMessageFormat>,
    theme: theme.createChain<GPTModelMessageFormat>,
    customize: customize.createChain<GPTModelMessageFormat>,
  },
};

export const action = async function action({
  request,
}: ActionArgs): Promise<
  SuccessResponse<z.infer<typeof StepSchema>> | ErrorResponse
> {
  if (!isFeatureEnabled("ai")) {
    return {
      success: false,
      type: "feature_disabled",
      status: 503,
      message: "The feature is not available",
    };
  }

  if (!env.OPENAI_KEY) {
    return {
      success: false,
      type: "invalid_apiKey",
      status: 401,
      message: "",
    };
  }

  if (!env.OPENAI_ORG || !env.OPENAI_ORG.startsWith("org-")) {
    return {
      success: false,
      type: "invalid_org",
      status: 401,
      message: "",
    };
  }

  const parsed = RequestSchema.safeParse(await request.json());

  if (parsed.success === false) {
    console.log("ERROR: req parse");

    return {
      success: false,
      type: "invalid_request",
      status: 400,
      message:
        process.env.NODE_ENV === "development"
          ? parsed.error.errors //JSON.stringify(parsed.error.errors, null, 2)
          : "",
    };
  }

  const formData = parsed.data;

  /* Permissions check */
  const requestContext = await createContext(request);
  const canEdit = await authorizeProject.hasProjectPermit(
    { projectId: formData.projectId, permit: "edit" },
    requestContext
  );
  if (canEdit === false) {
    return {
      success: false,
      type: "unauthorized",
      status: 401,
      message: "You don't have edit access to this project",
    };
  }
  /* End of Permissions check */

  // @todo add rate limiting

  const context: ChainContext = {
    api: {
      getBuild: async function getBuild({ projectId, buildId }) {
        let build;

        if (buildId) {
          const dbResult = await prisma.build.findUnique({
            where: { id_projectId: { projectId, id: buildId } },
          });

          if (!dbResult) {
            throw new Error("Build not found");
          }

          build = parseBuild(dbResult);
        } else {
          build = await loadBuildByProjectId(projectId);
        }

        if (!build) {
          throw new Error("Build not found");
        }

        return build;
      },
    },
    prompts: {
      request: formData.prompt,
      components: formData.components || "[]",
      theme: formData.theme || "{}",
    },
    messages: (formData.messages || []).map((message) => JSON.parse(message)),
    projectId: formData.projectId,
    buildId: formData.buildId,
    instanceId: formData.instanceId,
  };

  const responses = [];

  for (const step of formData.steps) {
    let chain = null;

    if (step in chains.generate) {
      chain = chains.generate[step]();
    } else {
      return {
        success: false,
        type: "invalid_action",
        status: 404,
        message: "",
      };
    }

    let temperature = 0.5;

    switch (step) {
      case "customize":
        temperature = 0;
        break;
      case "theme":
        temperature = 0.5;
        break;
      case "sections":
        temperature = 0.25;
        break;
      case "ui":
        temperature = 0.5;
        break;
    }

    const model = createGptModel({
      apiKey: env.OPENAI_KEY,
      organization: env.OPENAI_ORG,
      temperature,
      model: "gpt-3.5-turbo",
    });

    const chainResponse = await chain({ model, context });

    if (chainResponse.success === false) {
      if (process.env.NODE_ENV === "production") {
        chainResponse.message = "An error occurred.";
      }
      return chainResponse;
    }

    responses.push({
      step,
      json: chainResponse.json,
      code: chainResponse.code,
    });
  }

  return {
    success: true,
    responses,
  };
};
