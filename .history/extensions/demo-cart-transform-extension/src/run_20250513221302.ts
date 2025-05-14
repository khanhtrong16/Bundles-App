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
    (!merchandise.componentReferences && !merchandise.component_reference) ||
    (!merchandise.componentQuantities && !merchandise.component_quantities) ||
    merchandise.isGiftCard
  ) {
    console.log(
      `Skipping expand for ${cartLineId}: missing required properties or is gift card`,
    );
    return null;
  }

  console.log(`Attempting to expand line ${cartLineId}:`, {
    componentReferences:
      merchandise.componentReferences || merchandise.component_reference,
    componentQuantities:
      merchandise.componentQuantities || merchandise.component_quantities,
  });

  let componentReferences: string[];
  let componentQuantities: number[];

  try {
    // Xử lý componentReferences - kiểm tra cả camelCase và snake_case
    const refProperty =
      merchandise.componentReferences || merchandise.component_reference;
    if (typeof refProperty === "object" && refProperty.value) {
      componentReferences = JSON.parse(refProperty.value);
    } else if (Array.isArray(refProperty)) {
      componentReferences = refProperty;
    } else {
      console.error(`Invalid componentReferences format for ${cartLineId}`);
      return null;
    }

    // Xử lý componentQuantities - kiểm tra cả camelCase và snake_case
    const qtyProperty =
      merchandise.componentQuantities || merchandise.component_quantities;
    if (typeof qtyProperty === "object" && qtyProperty.value) {
      componentQuantities = JSON.parse(qtyProperty.value);
    } else if (Array.isArray(qtyProperty)) {
      componentQuantities = qtyProperty;
    } else {
      console.error(`Invalid componentQuantities format for ${cartLineId}`);
      return null;
    }

    if (
      componentReferences.length !== componentQuantities.length ||
      componentReferences.length === 0
    ) {
      console.error(
        `Invalid bundle composition for ${cartLineId}: lengths don't match or empty arrays`,
      );
      return null;
    }

    const expandedCartItems: ExpandedItem[] = componentReferences.map(
      (merchandiseId, index) => ({
        merchandiseId,
        quantity: componentQuantities[index],
      }),
    );

    console.log(
      `Successfully created expandedCartItems for ${cartLineId}:`,
      expandedCartItems,
    );

    const price =
      merchandise.priceAdjustment || merchandise.price_adjustment
        ? {
            percentageDecrease: {
              value: parseFloat(
                (merchandise.priceAdjustment || merchandise.price_adjustment)
                  .value,
              ),
            },
          }
        : undefined;

    return {
      cartLineId,
      expandedCartItems,
      price,
    };
  } catch (error) {
    console.error(
      `Error processing expand operation for ${cartLineId}:`,
      error,
    );
    return null;
  }
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
    // Kiểm tra cả camelCase và snake_case
    const componentParents =
      merchandise.componentParents || merchandise.component_parents;

    if (componentParents) {
      console.log(
        `Found component parents in line ${line.id}:`,
        componentParents.value,
      );
      try {
        const parsed = JSON.parse(componentParents.value);
        for (const entry of parsed) {
          console.log(`Parsing parent entry: ${JSON.stringify(entry)}`);

          // Kiểm tra xem các thành phần có đúng cấu trúc hay không
          let component_reference, component_quantities;

          if (
            typeof entry.component_reference === "object" &&
            entry.component_reference?.value
          ) {
            component_reference = entry.component_reference.value;
          } else if (Array.isArray(entry.component_reference)) {
            component_reference = entry.component_reference;
          } else {
            console.error(
              `Invalid component_reference format for ${entry.id}:`,
              entry.component_reference,
            );
            continue;
          }

          if (
            typeof entry.component_quantities === "object" &&
            entry.component_quantities?.value
          ) {
            component_quantities = entry.component_quantities.value;
          } else if (Array.isArray(entry.component_quantities)) {
            component_quantities = entry.component_quantities;
          } else {
            console.error(
              `Invalid component_quantities format for ${entry.id}:`,
              entry.component_quantities,
            );
            continue;
          }

          defs.push({
            id: entry.id,
            component_reference: component_reference,
            component_quantities: component_quantities,
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
  console.log(`Line tracker initialized with ${lineTracker.size} items`);

  for (let i = 0; i < def.component_reference.length; i++) {
    const refId = def.component_reference[i];
    const quantity = def.component_quantities[i];
    console.log(`Looking for component: ${refId} with quantity ${quantity}`);

    const matchingLine = cartLines.find((line) => {
      const hasType = line.merchandise.__typename === "ProductVariant";
      const matchesId = line.merchandise.id === refId;
      const trackerQty = lineTracker.get(line.id) || 0;
      const hasEnoughQty = trackerQty >= quantity;

      console.log(
        `Checking line ${line.id}: type=${hasType}, id match=${matchesId}, qty=${trackerQty}>=${quantity}=${hasEnoughQty}`,
      );

      return hasType && matchesId && hasEnoughQty;
    });

    if (matchingLine) {
      console.log(`Found matching line: ${matchingLine.id}`);
      results.push({
        cartLineId: matchingLine.id,
        quantity,
      });

      const currentQty = lineTracker.get(matchingLine.id) || 0;
      lineTracker.set(matchingLine.id, currentQty - quantity);
      console.log(
        `Updated quantity for ${matchingLine.id}: ${currentQty} -> ${currentQty - quantity}`,
      );
    } else {
      console.log(`No matching line found for component ${refId}`);
    }
  }

  // Update cartLines to reflect the remaining quantities (for future merges)
  for (const [id, remainingQty] of lineTracker.entries()) {
    if (remainingQty === 0) {
      const index = cartLines.findIndex((l) => l.id === id);
      if (index !== -1) {
        cartLines.splice(index, 1);
        console.log(`Removed line ${id} from cart (quantity used up)`);
      }
    } else {
      const line = cartLines.find((l) => l.id === id);
      if (line) {
        line.quantity = remainingQty;
        console.log(`Updated line ${id} quantity to ${remainingQty}`);
      }
    }
  }

  return results;
}
