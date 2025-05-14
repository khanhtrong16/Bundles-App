import {
  CartOperation,
  FunctionRunResult,
  Input,
  CartLineInput as ApiCartLineInput,
  MergeOperation,
  ExpandOperation,
  ExpandedItem,
  PriceAdjustment,
} from "../generated/api";
import { ComponentParent, ComponentParentMetafield } from "./index";

const NO_CHANGES: FunctionRunResult = { operations: [] };

/**
 * Shopify Function for cart transformation
 * Handles merge and expand operations for bundle products
 */
export function run(input: Input): FunctionRunResult {
  const operations: CartOperation[] = [
    ...getMergeCartOperations(input.cart),
    ...getExpandCartOperations(input.cart),
  ];

  return {
    operations,
  };
}

// =====================================
// Merge Operations
// =====================================

function getMergeCartOperations(cart: Input["cart"]): CartOperation[] {
  const mergeParentDefinitions = getMergeParentDefinitions(cart);
  const cartLines = [...cart.lines];

  return mergeParentDefinitions
    .map((definition) => {
      const componentsInCart = getComponentsInCart(cartLines, definition);

      if (componentsInCart.length === definition.component_reference.length) {
        const mergeOperation: MergeOperation = {
          parentVariantId: definition.id,
          cartLines: componentsInCart.map((component) => ({
            cartLineId: component.cart_line_id,
            quantity: component.quantity,
          })),
          price: definition.price_adjustment
            ? {
                percentageDecrease: {
                  value: definition.price_adjustment,
                },
              }
            : undefined,
        };

        return {
          merge: mergeOperation,
        } as CartOperation;
      }

      return null;
    })
    .filter((op): op is CartOperation => op !== null);
}

function getMergeParentDefinitions(cart: Input["cart"]): ComponentParent[] {
  const mergeParentDefinitions: ComponentParent[] = [];

  for (const line of cart.lines) {
    if (line.merchandise.__typename === "ProductVariant") {
      const merchandise = line.merchandise as any;
      if (merchandise.component_parents) {
        try {
          const value: ComponentParentMetafield[] = JSON.parse(
            merchandise.component_parents.value,
          );

          for (const parentDefinition of value) {
            mergeParentDefinitions.push({
              id: parentDefinition.id,
              component_reference: parentDefinition.component_reference.value,
              component_quantities: parentDefinition.component_quantities.value,
              price_adjustment: parentDefinition.price_adjustment?.value,
            });
          }
        } catch (error) {
          console.error("Error parsing component_parents:", error);
        }
      }
    }
  }

  return mergeParentDefinitions;
}

interface InternalCartLineInput {
  cart_line_id: string;
  quantity: number;
}

function getComponentsInCart(
  cartLines: Input["cart"]["lines"],
  definition: ComponentParent,
): InternalCartLineInput[] {
  const results: InternalCartLineInput[] = [];
  const lineTracker = new Map(
    cartLines.map((line) => [line.id, line.quantity]),
  );

  for (let i = 0; i < definition.component_reference.length; i++) {
    const reference = definition.component_reference[i];
    const quantity = definition.component_quantities[i];

    const matchingLine = cartLines.find(
      (line) =>
        line.merchandise.__typename === "ProductVariant" &&
        line.merchandise.id === reference &&
        (lineTracker.get(line.id) || 0) >= quantity,
    );

    if (matchingLine) {
      results.push({
        cart_line_id: matchingLine.id,
        quantity: quantity,
      });

      lineTracker.set(
        matchingLine.id,
        (lineTracker.get(matchingLine.id) || 0) - quantity,
      );
    }
  }

  // Update cartLines based on remaining quantities
  updateCartLinesFromResults(cartLines, lineTracker);

  return results;
}

function updateCartLinesFromResults(
  cartLines: Input["cart"]["lines"],
  lineTracker: Map<string, number>,
): void {
  // Remove lines with 0 quantity
  for (let i = cartLines.length - 1; i >= 0; i--) {
    const line = cartLines[i];
    const remainingQty = lineTracker.get(line.id) || 0;

    if (remainingQty <= 0) {
      cartLines.splice(i, 1);
    } else {
      line.quantity = remainingQty;
    }
  }
}

// =====================================
// Expand Operations
// =====================================

function getExpandCartOperations(cart: Input["cart"]): CartOperation[] {
  return cart.lines
    .map((line) => {
      if (line.merchandise.__typename !== "ProductVariant") {
        return null;
      }

      const merchandise = line.merchandise as any;
      const componentReferences = getComponentReferences(merchandise);
      const componentQuantities = getComponentQuantities(merchandise);

      if (
        componentReferences.length === 0 ||
        componentReferences.length !== componentQuantities.length
      ) {
        return null;
      }

      const expandedItems: ExpandedItem[] = componentReferences.map(
        (merchandiseId, index) => ({
          merchandiseId,
          quantity: componentQuantities[index],
        }),
      );

      const priceAdjustment = getPriceAdjustment(merchandise);

      return {
        expand: {
          cartLineId: line.id,
          expandedCartItems: expandedItems,
          price: priceAdjustment,
        },
      } as CartOperation;
    })
    .filter((op): op is CartOperation => op !== null);
}

function getComponentReferences(variant: any): string[] {
  if (!variant.component_reference) {
    return [];
  }

  try {
    return JSON.parse(variant.component_reference.value);
  } catch (error) {
    console.error("Error parsing component_reference:", error);
    return [];
  }
}

function getComponentQuantities(variant: any): number[] {
  if (!variant.component_quantities) {
    return [];
  }

  try {
    return JSON.parse(variant.component_quantities.value);
  } catch (error) {
    console.error("Error parsing component_quantities:", error);
    return [];
  }
}

function getPriceAdjustment(variant: any): PriceAdjustment | undefined {
  if (!variant.price_adjustment) {
    return undefined;
  }

  try {
    return {
      percentageDecrease: {
        value: parseFloat(variant.price_adjustment.value),
      },
    };
  } catch (error) {
    console.error("Error parsing price_adjustment:", error);
    return undefined;
  }
}
