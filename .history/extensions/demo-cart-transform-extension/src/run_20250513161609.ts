/* eslint-disable @typescript-eslint/consistent-type-imports */
// import {
//   Cart,
//   FunctionRunResult,
//   ExpandedItem,
//   ExpandOperation,
//   CartOperation,
// } from "@shopify/shopify_function";

import { CartOperation, FunctionRunResult, Input } from "../generated/api";

const NO_CHANGES: FunctionRunResult = { operations: [] };

export function run(input: Input): FunctionRunResult {
  console.log("đã đến đây");

  // console.log("input Đây:", JSON.stringify(input, null, 2));
  console.log("cartLine ", input.cart.lines);

  const operations: CartOperation[] = input.cart.lines.reduce((acc, line) => {
    const expandOperation = optionallyBuildExpandOperation(line);
    console.log("log 1", expandOperation);

    if (expandOperation) {
      return [...acc, { expand: expandOperation }];
    }
    return acc;
  }, [] as CartOperation[]);

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
