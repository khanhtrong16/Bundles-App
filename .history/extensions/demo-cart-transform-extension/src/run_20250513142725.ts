/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Cart,
  FunctionRunResult,
  ExpandedItem,
  ExpandOperation,
  CartOperation,
} from "@shopify/shopify_function";

export function run(input: { cart: Cart }): FunctionRunResult {
  const operations = input.cart.lines.reduce(
    /** @param {CartOperation[]} acc */
    (acc, cartLine) => {
      const expandOperation = optionallyBuildExpandOperation(cartLine);

      if (expandOperation) {
        return [...acc, { expand: expandOperation }];
      }

      return acc;
    },
    [],
  );

  return operations.length > 0 ? { operations } : onchange;
}

function getComponentReferences(variant: {
  metafield?: { value: string };
}): string[] {
  if (variant.metafield) {
    try {
      return JSON.parse(variant.metafield.value);
    } catch (error) {
      console.error("Error parsing component references:", error);
    }
  }
  return [];
}
