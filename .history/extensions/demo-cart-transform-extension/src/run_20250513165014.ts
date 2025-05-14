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
  const operations: CartOperation[] = input.cart.lines.reduce((acc, line) => {
    const expandOperation = optionallyBuildExpandOperation(line);
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
  console.log("hasExpandMetafields", hasExpandMetafields);

  if (hasExpandMetafields) {
    const componentReferences = JSON.parse(
      merchandise.componentReferences.value,
    );
    const componentQuantities = JSON.parse(
      merchandise.componentQuantities.value,
    );
    console.log("componentReferences", componentReferences.length);
    console.log("componentQuantities", componentQuantities.length);

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
    console.log("cartLineId", cartLineId);
    console.log(
      "expandedCartItems",
      JSON.stringify(expandedCartItems, null, 2),
    );

    if (expandedCartItems.length > 0) {
      return { cartLineId, expandedCartItems };
    }
  }

  return null;
}
