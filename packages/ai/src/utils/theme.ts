import {
  Theme,
  UnitValue,
  parseCssValue,
  type RgbValue,
} from "@webstudio-is/css-data";
import type { Entries } from "type-fest";
import { z } from "zod";

export const fromRawTheme = (theme: ThemeRaw): Theme => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore @todo initialize this to an empty valid Theme
  const result: Theme = {};

  (
    Object.keys(theme.backgroundColor) as (keyof typeof theme.backgroundColor)[]
  ).forEach((name) => {
    result.backgroundColor = result.backgroundColor || {};
    result.backgroundColor[name] = hexToRgbValue(theme.backgroundColor[name]);
  });

  (Object.keys(theme.color) as (keyof typeof theme.color)[]).forEach((name) => {
    result.color = result.color || {};
    result.color[name] = hexToRgbValue(theme.color[name]);
  });

  (Object.keys(theme.border) as (keyof typeof theme.border)[]).forEach(
    (name) => {
      result.border = result.border || {};
      result.border[name] = hexToRgbValue(theme.border[name]);
    }
  );

  (
    Object.keys(theme.boxShadowColor) as (keyof typeof theme.boxShadowColor)[]
  ).forEach((name) => {
    result.boxShadowColor = result.boxShadowColor || {};
    result.boxShadowColor[name] = hexToRgbValue(theme.boxShadowColor[name]);
  });

  result.gradientColorStops = theme.gradientColorStops.map((colorStops) =>
    colorStops.map(hexToRgbValue)
  ) as Theme["gradientColorStops"];

  (Object.keys(theme.fontFamily) as (keyof typeof theme.fontFamily)[]).forEach(
    (name) => {
      result.fontFamily = result.fontFamily || {};
      result.fontFamily[name] = {
        type: "fontFamily",
        value: theme.fontFamily[name],
      };
    }
  );

  (Object.keys(theme.fontSize) as (keyof typeof theme.fontSize)[]).forEach(
    (name) => {
      result.fontSize = result.fontSize || {};

      const fontSize = parseCssValue(
        "fontSize",
        theme.fontSize[name][0]
      ) as UnitValue;

      const lineHeight = parseCssValue(
        "lineHeight",
        theme.fontSize[name][1].lineHeight || "1.4"
      ) as UnitValue;

      result.fontSize[name] = [fontSize, { lineHeight: lineHeight }];
    }
  );

  (
    Object.keys(theme.borderRadius) as (keyof typeof theme.borderRadius)[]
  ).forEach((name) => {
    result.borderRadius = result.borderRadius || {};
    const borderRadius = parseCssValue(
      "width",
      theme.borderRadius[name]
    ) as UnitValue;

    result.borderRadius[name] = borderRadius;
  });

  (Object.keys(theme.spacing) as (keyof typeof theme.spacing)[]).forEach(
    (name) => {
      result.spacing = result.spacing || {};

      const spacing = parseCssValue("width", theme.spacing[name]) as UnitValue;

      result.spacing[name] = spacing;
    }
  );

  return result;
};

export const toRawTheme = (theme: Theme): ThemeRaw => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore @todo initialize this to an empty valid ThemeRaw
  const result: ThemeRaw = {};

  (
    Object.keys(theme.backgroundColor) as (keyof typeof theme.backgroundColor)[]
  ).forEach((name) => {
    result.backgroundColor = result.backgroundColor || {};
    result.backgroundColor[name] = rgbaToHex(theme.backgroundColor[name]);
  });

  (Object.keys(theme.color) as (keyof typeof theme.color)[]).forEach((name) => {
    result.color = result.color || {};
    result.color[name] = rgbaToHex(theme.color[name]);
  });

  (Object.keys(theme.border) as (keyof typeof theme.border)[]).forEach(
    (name) => {
      result.border = result.border || {};
      result.border[name] = rgbaToHex(theme.border[name]);
    }
  );

  (
    Object.keys(theme.boxShadowColor) as (keyof typeof theme.boxShadowColor)[]
  ).forEach((name) => {
    result.boxShadowColor = result.boxShadowColor || {};
    result.boxShadowColor[name] = rgbaToHex(theme.boxShadowColor[name]);
  });

  result.gradientColorStops = theme.gradientColorStops.map((colorStops) =>
    colorStops.map(rgbaToHex)
  ) as ThemeRaw["gradientColorStops"];

  (Object.keys(theme.fontFamily) as (keyof typeof theme.fontFamily)[]).forEach(
    (name) => {
      result.fontFamily = result.fontFamily || {};
      result.fontFamily[name] = theme.fontFamily[name].value;
    }
  );

  (Object.keys(theme.fontSize) as (keyof typeof theme.fontSize)[]).forEach(
    (name) => {
      result.fontSize = result.fontSize || {};
      const sizes = theme.fontSize[name];
      const fontSize = `${sizes[0].value}${sizes[0].unit}`;
      const lineHeight = sizes[1].lineHeight
        ? `${sizes[1].lineHeight.value}${sizes[1].lineHeight.unit}`
        : "1.4";
      result.fontSize[name] = [fontSize, { lineHeight: lineHeight }];
    }
  );

  (
    Object.keys(theme.borderRadius) as (keyof typeof theme.borderRadius)[]
  ).forEach((name) => {
    result.borderRadius = result.borderRadius || {};
    if (name === "none") {
      result.borderRadius[name] = "0px";
    } else if (name === "full") {
      result.borderRadius[name] = "9999px";
    } else {
      const borderRadius = theme.borderRadius[name];
      result.borderRadius[name] = `${borderRadius.value}${borderRadius.unit}`;
    }
  });

  (Object.keys(theme.spacing) as (keyof typeof theme.spacing)[]).forEach(
    (name) => {
      result.spacing = result.spacing || {};
      const spacing = theme.spacing[name];
      result.spacing[name] = `${spacing.value}${spacing.unit}`;
    }
  );

  return result;
};

type TokenToThemeFilter = (property: string, value: string | number) => boolean;
export const toTokensTheme = (
  theme: Theme,
  filter?: TokenToThemeFilter
): string[] => {
  return (Object.entries(theme) as Entries<Theme>).flatMap(
    ([property, value]) => {
      if (Array.isArray(value)) {
        let intermediate = value;
        if (filter) {
          intermediate = intermediate.filter((_, index) =>
            filter(property, index)
          );
        }
        return intermediate.map((_, index) => `${property}.${index}`);
      }

      let intermediate = Object.keys(value);
      if (filter) {
        intermediate = intermediate.filter((_, index) =>
          filter(property, index)
        );
      }
      return intermediate.map((value) => `${property}.${value}`);
    }
  );
};

export const hexToRgbValue = function (color: string): RgbValue {
  const parsed = parseCssValue("color", color);
  if (parsed.type === "rgb") {
    return parsed;
  }

  return {
    type: "rgb",
    r: 0,
    g: 0,
    b: 0,
    alpha: 0,
  };
};

export const rgbaToHex = function rgbaToHex(color: RgbValue): string {
  const { r, g, b, alpha } = color;

  // Convert the decimal color components to hexadecimal strings
  const rHex = Math.round(r).toString(16).padStart(2, "0");
  const gHex = Math.round(g).toString(16).padStart(2, "0");
  const bHex = Math.round(b).toString(16).padStart(2, "0");
  const aHex =
    alpha < 1
      ? Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")
      : "";

  // Combine the hexadecimal color components
  const hex = `#${rHex}${gHex}${bHex}${aHex}`;

  return hex;
};

// ThemeRaw is a theme that doesn't use Webstudio's typed values. We get this when generating with AI etc.
// Such a theme must be converted to a Theme like the one above.

// @todo refine this type
const HexColor = z.string();
// const ThemeRawColorValue = z.record(ThemeColor, z.tuple([HexColor]));
const ThemeRawColorValue = z.object({
  base: HexColor,
  elevate: HexColor,
  primary: HexColor,
  secondary: HexColor,
  accent: HexColor,
  muted: HexColor,
  destructive: HexColor,
});
// @todo refine to `${number}rem`
const ThemeRawSizeValue = z.string();
// [fontSize, lineHeight]
const ThemeRawFontSizeValue = z.tuple([
  ThemeRawSizeValue,
  z.object({
    lineHeight: ThemeRawSizeValue,
  }),
]);

const ThemeRawFontFamilyValue = z.array(z.string());

export const ThemeRaw = z.object({
  backgroundColor: ThemeRawColorValue,
  color: ThemeRawColorValue,
  border: ThemeRawColorValue,
  boxShadowColor: ThemeRawColorValue,
  gradientColorStops: z.tuple([
    z.tuple([HexColor, HexColor]),
    z.tuple([HexColor, HexColor]),
    z.tuple([HexColor, HexColor]),
  ]),
  fontFamily: z.object({
    base: ThemeRawFontFamilyValue,
    headings: ThemeRawFontFamilyValue,
  }),
  fontSize: z.object({
    xs: ThemeRawFontSizeValue,
    sm: ThemeRawFontSizeValue,
    base: ThemeRawFontSizeValue,
    lg: ThemeRawFontSizeValue,
    xl: ThemeRawFontSizeValue,
    "2xl": ThemeRawFontSizeValue,
    "3xl": ThemeRawFontSizeValue,
    "4xl": ThemeRawFontSizeValue,
    "5xl": ThemeRawFontSizeValue,
    "6xl": ThemeRawFontSizeValue,
    "7xl": ThemeRawFontSizeValue,
    "8xl": ThemeRawFontSizeValue,
    "9xl": ThemeRawFontSizeValue,
  }),
  borderRadius: z.object({
    none: z.literal("0px"),
    full: z.literal("9999px"),
    sm: ThemeRawSizeValue,
    DEFAULT: ThemeRawSizeValue,
    md: ThemeRawSizeValue,
    lg: ThemeRawSizeValue,
    xl: ThemeRawSizeValue,
    "2xl": ThemeRawSizeValue,
    "3xl": ThemeRawSizeValue,
  }),
  spacing: z.object({
    px: ThemeRawSizeValue,
    0: ThemeRawSizeValue,
    "0.5": ThemeRawSizeValue,
    1: ThemeRawSizeValue,
    "1.5": ThemeRawSizeValue,
    2: ThemeRawSizeValue,
    "2.5": ThemeRawSizeValue,
    3: ThemeRawSizeValue,
    "3.5": ThemeRawSizeValue,
    4: ThemeRawSizeValue,
    5: ThemeRawSizeValue,
    6: ThemeRawSizeValue,
    7: ThemeRawSizeValue,
    8: ThemeRawSizeValue,
    9: ThemeRawSizeValue,
    10: ThemeRawSizeValue,
    11: ThemeRawSizeValue,
    12: ThemeRawSizeValue,
    14: ThemeRawSizeValue,
    16: ThemeRawSizeValue,
    20: ThemeRawSizeValue,
    24: ThemeRawSizeValue,
    28: ThemeRawSizeValue,
    32: ThemeRawSizeValue,
    36: ThemeRawSizeValue,
    40: ThemeRawSizeValue,
    44: ThemeRawSizeValue,
    48: ThemeRawSizeValue,
    52: ThemeRawSizeValue,
    56: ThemeRawSizeValue,
    60: ThemeRawSizeValue,
    64: ThemeRawSizeValue,
    72: ThemeRawSizeValue,
    80: ThemeRawSizeValue,
    96: ThemeRawSizeValue,
  }),
});

export type ThemeRaw = z.infer<typeof ThemeRaw>;
