import {
  CartOperation,
  FunctionRunResult,
  Input,
  CartLineInput,
  MergeOperation,
  ExpandOperation,
  ExpandedItem,
  PriceAdjustment,
  PriceAdjustmentValue,
} from "../generated/api";

const NO_CHANGES: FunctionRunResult = { operations: [] };

/**
 * Hàm chính xử lý cart transform cho Shopify Function
 * - Tìm các bundle có thể merge (gộp) dựa vào component_parents
 * - Tìm các bundle có thể expand (mở rộng) dựa vào component_reference
 * - Trả về danh sách các operation phù hợp
 */
export function run(input: Input): FunctionRunResult {
  console.log("Input cart lines:", JSON.stringify(input.cart.lines, null, 2));

  const mergeOperations = getMergeCartOperations(input.cart.lines);
  console.log("Merge operations:", JSON.stringify(mergeOperations, null, 2));

  const expandOperations = getExpandCartOperations(input.cart.lines);
  console.log("Expand operations:", JSON.stringify(expandOperations, null, 2));

  const operations: CartOperation[] = [...mergeOperations, ...expandOperations];
  console.log("Final operations:", JSON.stringify(operations, null, 2));

  // Nếu có operation thì trả về, không thì trả về NO_CHANGES
  return operations.length > 0 ? { operations } : NO_CHANGES;
}

// =========================
// Expand Operation
// =========================

function getExpandCartOperations(cartLines): CartOperation[] {
  console.log("Checking for expandable products...");
  return cartLines.reduce((acc, line) => {
    console.log(`Checking line ${line.id} for expand capability...`);
    const operation = optionallyBuildExpandOperation(line);
    if (operation) {
      console.log(`Found expandable product: ${line.id}`);
      acc.push({ expand: operation });
    }
    return acc;
  }, [] as CartOperation[]);
}

function optionallyBuildExpandOperation(line): ExpandOperation | null {
  const { id: cartLineId, merchandise } = line;

  if (
    !merchandise.componentReferences ||
    !merchandise.componentQuantities ||
    merchandise.isGiftCard
  ) {
    return null;
  }

  const componentReferences: string[] = JSON.parse(
    merchandise.componentReferences.value,
  );
  const componentQuantities: number[] = JSON.parse(
    merchandise.componentQuantities.value,
  );

  if (
    componentReferences.length !== componentQuantities.length ||
    componentReferences.length === 0
  ) {
    throw new Error("Invalid bundle composition");
  }

  const expandedCartItems: ExpandedItem[] = componentReferences.map(
    (merchandiseId, index) => ({
      merchandiseId,
      quantity: componentQuantities[index],
    }),
  );

  const price = merchandise.priceAdjustment
    ? {
        percentageDecrease: {
          value: parseFloat(merchandise.priceAdjustment.value),
        },
      }
    : undefined;

  return {
    cartLineId,
    expandedCartItems,
    price,
  };
}

// =========================
// Merge Operation
// =========================

function getMergeCartOperations(cartLines): CartOperation[] {
  console.log("Checking for mergeable products...");
  const cloneLines = [...cartLines];
  const mergeDefs = getMergeParentDefinitions(cloneLines);
  console.log("Merge definitions:", JSON.stringify(mergeDefs, null, 2));

  const operations: CartOperation[] = [];

  for (const def of mergeDefs) {
    console.log(`Checking components for parent ID: ${def.id}`);
    const matchingLines = getComponentsInCart(cloneLines, def);
    console.log(
      `Found ${matchingLines.length} matching lines out of ${def.component_reference.length} required`,
    );

    if (matchingLines.length === def.component_reference.length) {
      const price = def.price_adjustment
        ? {
            percentageDecrease: {
              value: def.price_adjustment,
            },
          }
        : undefined;

      operations.push({
        merge: {
          parentVariantId: def.id,
          cartLines: matchingLines,
          price,
        },
      });
      console.log(`Added merge operation for parent: ${def.id}`);
    }
  }

  return operations;
}

function getMergeParentDefinitions(cartLines) {
  const defs = [];

  for (const line of cartLines) {
    const merchandise = line.merchandise;
    const componentParents = merchandise.componentParents;

    if (componentParents) {
      console.log(
        `Found component parents in line ${line.id}:`,
        componentParents.value,
      );
      try {
        const parsed = JSON.parse(componentParents.value);
        for (const entry of parsed) {
          console.log(`Parsing parent entry: ${JSON.stringify(entry)}`);
          defs.push({
            id: entry.id,
            component_reference: entry.component_reference.value,
            component_quantities: entry.component_quantities.value,
            price_adjustment: entry.price_adjustment?.value ?? undefined,
          });
        }
      } catch (error) {
        console.error(
          `Error parsing componentParents for line ${line.id}:`,
          error,
        );
      }
    }
  }

  return defs;
}

function getComponentsInCart(cartLines, def): CartLineInput[] {
  const results: CartLineInput[] = [];
  const lineTracker = new Map(cartLines.map((l) => [l.id, l.quantity]));

  for (let i = 0; i < def.component_reference.length; i++) {
    const refId = def.component_reference[i];
    const quantity = def.component_quantities[i];

    const matchingLine = cartLines.find(
      (line) =>
        line.merchandise.__typename === "ProductVariant" &&
        line.merchandise.id === refId &&
        lineTracker.get(line.id) >= quantity,
    );

    if (matchingLine) {
      results.push({
        cartLineId: matchingLine.id,
        quantity,
      });

      lineTracker.set(
        matchingLine.id,
        lineTracker.get(matchingLine.id) - quantity,
      );
    }
  }

  // Update cartLines to reflect the remaining quantities (for future merges)
  for (const [id, remainingQty] of lineTracker.entries()) {
    if (remainingQty === 0) {
      const index = cartLines.findIndex((l) => l.id === id);
      if (index !== -1) cartLines.splice(index, 1);
    } else {
      const line = cartLines.find((l) => l.id === id);
      if (line) line.quantity = remainingQty;
    }
  }

  return results;
}
