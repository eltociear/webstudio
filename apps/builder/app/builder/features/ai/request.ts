import type { ErrorResponse, SuccessResponse } from "@webstudio-is/ai";

export const request = function request<Name, Data>(
  ...args: Parameters<typeof fetch>
) {
  return fetch(...args)
    .then((res) => {
      if (res.ok === false) {
        return {
          success: false,
          type: "generic_error",
          status: res.status,
          message: res.statusText,
        };
      }
      return res.json();
    })
    .catch((error) => ({
      success: false,
      type: error.name === "AbortError" ? "aborted" : "generic_error",
      status: 500,
      message: "",
    })) as Promise<SuccessResponse<Name, Data> | ErrorResponse>;
};

export const retry = function retry<Name, Data>(
  fn: () => Promise<SuccessResponse<Name, Data> | ErrorResponse>,
  times = 3,
  timeout = 45000
): Promise<SuccessResponse<Name, Data> | ErrorResponse> {
  return fn().then((result) => {
    if (result.success === true) {
      return result;
    }
    if (times > 0) {
      return retry(fn, times - 1);
    }
    return {
      success: false,
      type: "retry_limit_reached",
      status: 500,
      message: "",
    };
  });
};
