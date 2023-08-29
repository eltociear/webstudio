import type { ChainResponseSuccess } from "./chains/types";

export type SuccessResponse<Step, Data = ChainResponseSuccess["json"]> = {
  success: true;
  responses: {
    step: Step;
    json: Data;
  }[];
};

export type ErrorResponse = {
  success: false;
  type: "generic_error" | string;
  status: number;
  message: string;
};

export * from "./templates/types";
