/* eslint-disable @typescript-eslint/consistent-type-imports */
// import {
//   Cart,
//   FunctionRunResult,
//   ExpandedItem,
//   ExpandOperation,
//   CartOperation,
// } from "@shopify/shopify_function";

import { Cart, CartOperation, FunctionRunResult } from "../generated/api";

export function run(input: { cart: Cart }): FunctionRunResult {
  const operations = input.cart.lines.reduce(
    // /** @param {CartOperation[]} acc */
    (acc, cartLine) => {
      const expandOperation = optionallyBuildExpandOperation(cartLine);

      if (expandOperation) {
        return [...acc, { expand: expandOperation }];
      }

      return acc;
    },
    [],
  );

  return operations.length > 0 ? { operations } : NO_CHANGES;
}

function optionallyBuildExpandOperation({ id: cartLineId, merchandise }) {
  const hasExpandMetafields =
    !!merchandise.componentQuantities && !!merchandise.componentReferences;
  if (merchandise.__typename === "ProductVariant" && hasExpandMetafields) {
    const componentReferences = JSON.parse(
      merchandise.componentReferences.value,
    );
    const componentQuantities = JSON.parse(
      merchandise.componentQuantities.value,
    );

    if (
      componentReferences.length !== componentQuantities.length ||
      componentReferences.length === 0
    ) {
      throw new Error("Invalid bundle composition");
    }

    const expandedCartItems = componentReferences.map(
      (merchandiseId, index) => ({
        merchandiseId: merchandiseId,
        quantity: componentQuantities[index],
      }),
    );

    if (expandedCartItems.length > 0) {
      return { cartLineId, expandedCartItems };
    }
  }

  return null;
}
