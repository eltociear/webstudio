import type { Build, StyleSourceToken } from "@webstudio-is/project-build";

const notEmpty = function notEmpty<TValue>(
  value: TValue | null | undefined
): value is TValue {
  return value !== null && value !== undefined;
};

export const getTokens = (build: Build): StyleSourceToken[] => {
  return build.styleSources
    .map(([id, styleSource]) =>
      styleSource.type === "token" ? styleSource : null
    )
    .filter(notEmpty);
};
