import store from "immerhin";
import {
  getStyleDeclKey,
  Instance,
  StyleDecl,
  StyleSourceSelection,
  StyleSourceSelections,
} from "@webstudio-is/project-build";
import {
  styleSourcesStore,
  stylesStore,
  styleSourceSelectionsStore,
  instancesStore,
} from "~/shared/nano-states";
import type { Tokens } from "@webstudio-is/ai";

const getNewTokenSourceId = (tokenName: string) => `theme:${tokenName}`;

export const createTokens = (tokens: Tokens) => {
  store.createTransaction(
    [styleSourcesStore, stylesStore],
    (styleSources, styles) => {
      tokens.forEach((token) => {
        const newStyleSource = {
          type: "token",
          id: token.id,
          name: token.name,
        } as const;

        if (styleSources.has(newStyleSource.id) === false) {
          styleSources.set(newStyleSource.id, newStyleSource);
        }
        token.styles.forEach((style) => {
          const styleDecl: StyleDecl = {
            styleSourceId: newStyleSource.id,
            breakpointId: "",
            property: style.property,
            value: style.value,
          };
          styles.set(getStyleDeclKey(styleDecl), styleDecl);
        });
      });
    }
  );
};

export const addTokensToInstances = (
  rootInstanceId: Instance["id"],
  tokens: Tokens,
  shouldAdd?: (
    instance: Instance,
    id: string,
    styleSourceSelection: StyleSourceSelection
  ) => boolean
) => {
  const instanceIds: string[] = [rootInstanceId];
  store.createTransaction(
    [
      stylesStore,
      styleSourcesStore,
      styleSourceSelectionsStore,
      instancesStore,
    ],
    (styles, styleSources, styleSourceSelections, instancesStore) => {
      while (instanceIds.length > 0) {
        const instanceId = instanceIds.pop();
        if (typeof instanceId !== "string") {
          continue;
        }

        const instance = instancesStore.get(instanceId);
        if (instance === undefined) {
          continue;
        }

        instanceIds.push(
          ...instance.children
            .filter((child) => child.type === "id")
            .map((child) => child.value)
        );

        const styleSourceSelection = getOrCreateStyleSourceSelectionMutable(
          styleSourceSelections,
          instanceId
        );

        tokens.forEach(({ id, name }) => {
          if (
            styleSourceSelection &&
            styleSourceSelection.values.includes(id) === false &&
            (typeof shouldAdd !== "function" ||
              shouldAdd(instance, id, styleSourceSelection) === true)
          ) {
            styleSourceSelection.values.push(id);
          }
        });
      }
    }
  );
};

const getOrCreateStyleSourceSelectionMutable = (
  styleSourceSelections: StyleSourceSelections,
  selectedInstanceId: Instance["id"]
) => {
  let styleSourceSelection = styleSourceSelections.get(selectedInstanceId);
  if (styleSourceSelection === undefined) {
    styleSourceSelection = {
      instanceId: selectedInstanceId,
      values: [],
    };
    styleSourceSelections.set(selectedInstanceId, styleSourceSelection);
  }
  return styleSourceSelection;
};

// // {
// //     id: "__ws:kVuWQyumz9K8e7OJ1anqY",
// //     name: "Container Columns",
// //     styles: [
// //       {
// //         property: "display",
// //         value: {
// //           type: "keyword",
// //           value: "flex",
// //         },
// //       },
// //     ],
// //   },

// export const _addTokensToInstances = (
//   rootInstanceId: Instance["id"],
//   tokens: Tokens
// ) => {
//   const tokenNames = Object.keys(tokens);
//   const instanceIds: string[] = [rootInstanceId];
//   console.log("herer");
//   store.createTransaction(
//     [
//       stylesStore,
//       styleSourcesStore,
//       styleSourceSelectionsStore,
//       instancesStore,
//     ],
//     (styles, styleSources, styleSourceSelections, instancesStore) => {
//       // Create new tokens.
//       for (const tokenName in tokens) {
//         const newStyleSource = {
//           type: "token",
//           // @todo Maybe we should use an internal prefix.
//           id: getNewTokenSourceId(tokenName),
//           name: tokenName,
//         } as const;

//         if (styleSources.has(newStyleSource.id) === false) {
//           styleSources.set(newStyleSource.id, newStyleSource);
//           tokens[tokenName].forEach((styleDecl) => {
//             styleDecl.styleSourceId = newStyleSource.id;
//             styles.set(getStyleDeclKey(styleDecl), styleDecl);
//           });
//         }
//       }
//       console.log("created tokens");
//       // Add tokens to instances.
//       const tokenSourceIds = new Map();

//       const getTokenSourceIdByName = function getTokenSourceIdByName(
//         existingTokenName: string
//       ) {
//         if (tokenSourceIds.has(existingTokenName)) {
//           return tokenSourceIds.get(existingTokenName);
//         }
//         for (const styleSource of styleSources.values()) {
//           if (
//             styleSource.type === "token" &&
//             styleSource.name === existingTokenName
//           ) {
//             tokenSourceIds.set(existingTokenName, styleSource.id);
//             return styleSource.id;
//           }
//         }
//       };

//       while (instanceIds.length > 0) {
//         const instanceId = instanceIds.pop();
//         if (typeof instanceId !== "string") {
//           continue;
//         }

//         const instance = instancesStore.get(instanceId);
//         if (instance === undefined) {
//           continue;
//         }

//         instanceIds.push(
//           ...instance.children
//             .filter((child) => child.type === "id")
//             .map((child) => child.value)
//         );

//         const styleSourceSelection = styleSourceSelections.get(instanceId);

//         tokenNames.forEach((existingTokenName) => {
//           const existingTokenSourceId =
//             getTokenSourceIdByName(existingTokenName);

//           const newTokenSourceId = getNewTokenSourceId(existingTokenName);

//           if (
//             styleSourceSelection &&
//             styleSourceSelection.values.includes(existingTokenSourceId) &&
//             styleSourceSelection.values.includes(
//               getNewTokenSourceId(newTokenSourceId)
//             ) === false
//           ) {
//             styleSourceSelection.values.push(newTokenSourceId);
//           }
//         });
//       }
//     }
//   );
// };
