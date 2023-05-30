import camelcase from "camelcase";
import * as csstree from "css-tree";
import warnOnce from "warn-once";
import { parseCssValue as parseCssValueLonghand } from "./parse-css-value";
import * as parsers from "./property-parsers/parsers";
import * as toLonghand from "./property-parsers/to-longhand";
import { StyleValue, type Style as S, type StyleProperty } from "./schema";

type Selector = string;
type Style = {
  // @todo add support for states and media queries in addition to declarations
  property: StyleProperty;
  value: StyleValue;
};

export type Styles = Record<Selector, Style[]>;

type Longhand = keyof typeof toLonghand;

const parseCssValue = function parseCssValue(
  property: Longhand | StyleProperty,
  value: string
): S {
  const unwrap = toLonghand[property as Longhand];

  if (typeof unwrap === "function") {
    const longhands = unwrap(value);

    return Object.fromEntries(
      Object.entries(longhands).map(([property, value]) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore @todo remove this ignore: property is a `keyof typeof longhands` which is a key in parsers but TS can't infer the link
        const valueParser = parsers[property];

        if (typeof valueParser === "function") {
          return [property, valueParser(value)];
        }

        if (Array.isArray(value)) {
          return [
            property,
            {
              type: "invalid",
              value: value.join(""),
            },
          ];
        }

        if (!value) {
          return [property, { type: "invalid", value: "" }];
        }

        return [
          property,
          parseCssValueLonghand(property as StyleProperty, value),
        ];
      })
    );
  }

  return {
    [property]: parseCssValueLonghand(property as StyleProperty, value),
  };
};

export const parseCss = function cssToWS(css: string) {
  const ast = csstree.parse(css);

  let selectors: Selector[] = [];
  const styles: Styles = {};

  csstree.walk(ast, (node, item) => {
    if (node.type === "SelectorList") {
      selectors = [];
    }
    if (node.type === "ClassSelector") {
      if (!item.prev && !item.next) {
        selectors.push(node.name);
      }
      return;
    }

    if (node.type === "Declaration") {
      const property = camelcase(node.property);
      const stringValue = csstree.generate(node.value);

      let parsedCss = {};

      try {
        parsedCss = parseCssValue(
          property as Longhand | StyleProperty,
          stringValue
        );
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          warnOnce(
            true,
            `paseCss: parsing failed for \`${node.property}: ${stringValue}\``
          );
        }
        return;
      }

      (Object.entries(parsedCss) as [StyleProperty, StyleValue][]).forEach(
        ([property, value]) => {
          try {
            StyleValue.parse(value);
            selectors.forEach((selector) => {
              if (Array.isArray(styles[selector])) {
                styles[selector].push({
                  property,
                  value,
                });
              } else {
                styles[selector] = [{ property, value }];
              }
            });
          } catch (error) {
            if (process.env.NODE_ENV !== "production") {
              // eslint-disable-next-line no-console
              console.warn(
                true,
                `Declaration parsing for \`${selectors.join(", ")}.${
                  node.property
                }: ${stringValue}\` failed:\n\n${JSON.stringify(
                  parsedCss,
                  null,
                  2
                )}`
              );
            }
          }
        }
      );
    }
  });

  return styles;
};
