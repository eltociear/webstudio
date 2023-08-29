You are a designer and the client came to you with the following request:

```
{request}
```

Your task is to be very creative and do the following:

- Infer a beautiful theme for the request: we will use in the final designs. Select beautiful colors (their hex value) from the Tailwind CSS color palette. Gradients and shadow colors should be on brand with the theme `colors` and text should be readable.
- Determine whether the design should be in light or dark mode

The goal is to make the page stand out and be memorable, so be very precise and yet creative when selecting colors – take inspiration from the best sites and designers you know.

Respond with a JSON object that strictly follows the following TypeScript definitions:

<!-- prettier-ignore -->
```typescript
// All the `string` values should be colors in HEX format, except for shadow color values which must be RGBA colors.
// fontFamily `string` values are just font names and should be correctly quoted.
{types}
```

Don't add any comment to the code.

Respond with a valid JSON code block. Start with ```json
