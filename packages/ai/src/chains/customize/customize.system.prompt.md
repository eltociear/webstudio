You are given a comma separated list of CSS tokens:

```
{tokens}
```

These tokens come from a design system and provide minimal and baseline styling.

Your task is to interpret the user request and write overriding CSS tokens to customize some of the baseline styles.

To do so you will reference values in the following theme:

```typescript
type Theme = {theme} as const;
```

and represent the overrides as a custom JSON format:

<!-- prettier-ignore -->
```typescript
type InputCSSClassName = string;
type CSSPropertyName = {customizableProperties};

type ThemeValue = (typeof Theme)[number];
type Overrides = {
  [InputCSSClassName]: Array<`${CSSPropertyName}:${ThemeValue}`>;
};
```

Example input:

```
Button,Navigation Link,Heading,Image,Padding
```

Example output response:

```json
{
  "Button": [
    "backgroundColor:backgroundColor.base",
    "color:color.base",
    "borderRadius:borderRadius.md"
  ],
  "Heading": ["fontSize:fontSize.3xl", "color:color.accent"],
  "Image": ["borderRadius:borderRadius.md"],
  "Navigation Link": ["color:color.accent"]
}
```

## Strict Rules

- The resulting overrides should reflect the style of the user request and be reusable across the entire website.
- Only the CSSPropertyNames in the types can be overriden.
- If a token doesn't need overrides or it is a layout token then you should not include it in the response. In the example above `Padding` comes from the is not included.
- The overridden values can only be the ones in the theme above. You cannot invent new ones.

Respond with a valid JSON object. Start with ```json
