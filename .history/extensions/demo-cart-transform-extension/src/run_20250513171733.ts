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
  // 1. Tìm tất cả merchandiseId là con của bundle cha
  const childMerchandiseIds = new Set<string>();
  input.cart.lines.forEach((line) => {
    const merchandise = line.merchandise as any;
    if (merchandise.componentReferences && merchandise.componentQuantities) {
      try {
        const componentReferences = JSON.parse(
          merchandise.componentReferences.value,
        );
        componentReferences.forEach((id: string) =>
          childMerchandiseIds.add(id),
        );
      } catch {}
    }
  });

  // 2. Chỉ expand các dòng là bundle cha (không phải con của bundle khác)
  const operations: CartOperation[] = input.cart.lines.reduce((acc, line) => {
    const merchandise = line.merchandise as any;
    // Là bundle cha nếu có componentReferences, componentQuantities và id KHÔNG nằm trong childMerchandiseIds
    if (
      merchandise.componentReferences &&
      merchandise.componentQuantities &&
      !childMerchandiseIds.has(merchandise.id)
    ) {
      const expandOperation = optionallyBuildExpandOperation(line);
      if (expandOperation) {
        return [...acc, { expand: expandOperation }];
      }
    }
    return acc;
  }, [] as CartOperation[]);

  return operations.length > 0 ? { operations } : NO_CHANGES;
}

function optionallyBuildExpandOperation(line) {
  const { id: cartLineId, merchandise } = line;
  const hasExpandMetafields =
    !!merchandise.componentQuantities && !!merchandise.componentReferences;

  if (hasExpandMetafields) {
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
