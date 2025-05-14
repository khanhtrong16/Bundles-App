import {
  CartLineInput,
  CartOperation,
  ExpandOperation,
  FunctionRunResult,
  Input,
  MergeOperation,
  PriceAdjustment,
} from "../generated/api";

type ID = string;

interface ComponentParent {
  id: ID;
  component_reference: ID[];
  component_quantities: number[];
  price_adjustment?: number;
}

interface ComponentParentMetafield {
  id: ID;
  component_reference: { value: string[] };
  component_quantities: { value: number[] };
  price_adjustment?: { value: number };
}

export function run(input: Input): FunctionRunResult {
  const cart = input.cart;
  console.log("Cart input:", JSON.stringify(cart.lines.length));

  const mergeOps = getMergeCartOperations(cart);
  const expandOps = getExpandCartOperations(cart);
  console.log("mergeOps", JSON.stringify(mergeOps));
  console.log("expandOps", JSON.stringify(expandOps));

  return {
    operations: [...mergeOps, ...expandOps],
  };
}

// ---------------------- Merge Logic ----------------------

function getMergeCartOperations(cart: Input["cart"]): CartOperation[] {
  const mergeParentDefs = getMergeParentDefinitions(cart);
  console.log("Merge parent definitions:", JSON.stringify(mergeParentDefs));

  const mutableLines = [...cart.lines];

  return mergeParentDefs.flatMap((definition) => {
    const componentsInCart = getComponentsInCart(mutableLines, definition);
    console.log(
      "Components in cart for",
      definition.id,
      ":",
      JSON.stringify(componentsInCart),
    );

    if (componentsInCart.length === definition.component_reference.length) {
      const cartLines: CartLineInput[] = componentsInCart;

      const price = definition.price_adjustment
        ? {
            percentageDecrease: {
              value: definition.price_adjustment,
            },
          }
        : undefined;

      const mergeOperation: MergeOperation = {
        parentVariantId: definition.id,
        cartLines,
        price,
      };

      return [{ merge: mergeOperation }];
    }

    return [];
  });
}

function getComponentsInCart(
  cartLines: Input["cart"]["lines"],
  definition: ComponentParent,
): CartLineInput[] {
  const result: CartLineInput[] = [];
  console.log("Checking components, definition:", JSON.stringify(definition));
  console.log(
    "Cart lines:",
    JSON.stringify(
      cartLines.map((l) => ({
        id: l.id,
        merchId:
          l.merchandise.__typename === "ProductVariant"
            ? l.merchandise.id
            : "not-variant",
        qty: l.quantity,
      })),
    ),
  );

  for (let i = 0; i < definition.component_reference.length; i++) {
    const refId = definition.component_reference[i];
    const requiredQty = definition.component_quantities[i];
    console.log(`Looking for component ${refId} with qty ${requiredQty}`);

    const foundLine = cartLines.find((line) => {
      const merch =
        line.merchandise.__typename === "ProductVariant"
          ? line.merchandise
          : null;

      const match = merch?.id === refId && line.quantity >= requiredQty;
      console.log(
        `Checking line ${line.id}, merch id: ${merch?.id || "unknown"}, qty: ${line.quantity}, match: ${match}`,
      );
      return match;
    });

    if (foundLine) {
      console.log(`Found matching line: ${foundLine.id}`);
      result.push({ cartLineId: foundLine.id, quantity: requiredQty });
      foundLine.quantity -= requiredQty; // update quantity
    } else {
      console.log(`No matching line found for ${refId}`);
    }
  }

  return result;
}

function getMergeParentDefinitions(cart: Input["cart"]): ComponentParent[] {
  const definitions: ComponentParent[] = [];

  for (const line of cart.lines) {
    if (line.merchandise.__typename === "ProductVariant") {
      const variant = line.merchandise as any;

      const parents = getComponentParents(variant);
      definitions.push(...parents);
    }
  }

  return definitions;
}

function getComponentParents(variant: any): ComponentParent[] {
  if (!variant.component_parents) return [];

  try {
    const value: ComponentParentMetafield[] = JSON.parse(
      variant.component_parents.value,
    );
    console.log("Parsed component_parents:", JSON.stringify(value));

    return value.map((parent) => ({
      id: parent.id,
      component_reference: parent.component_reference.value,
      component_quantities: parent.component_quantities.value,
      price_adjustment: parent.price_adjustment?.value,
    }));
  } catch (error) {
    console.error("Error parsing component_parents:", error);
    return [];
  }
}

// ---------------------- Expand Logic ----------------------

function getExpandCartOperations(cart: Input["cart"]): CartOperation[] {
  console.log("Starting expansion check for", cart.lines.length, "cart lines");

  return cart.lines.flatMap((line) => {
    if (line.merchandise.__typename !== "ProductVariant") {
      console.log(`Line ${line.id} is not a product variant, skipping`);
      return [];
    }

    const variant = line.merchandise as any;
    console.log(`Processing line ${line.id} with variant ${variant.id}`);

    const componentRefs = getComponentReferences(variant);
    const componentQtys = getComponentQuantities(variant);

    console.log(
      `Found ${componentRefs.length} refs and ${componentQtys.length} quantities`,
    );

    if (
      componentRefs.length === 0 ||
      componentRefs.length !== componentQtys.length
    ) {
      console.log(
        `Skipping - refs: ${componentRefs.length}, qtys: ${componentQtys.length}`,
      );
      return [];
    }

    const expandedItems = componentRefs.map((id, i) => ({
      merchandiseId: id,
      quantity: componentQtys[i],
    }));

    const price = getPriceAdjustment(variant);
    console.log(
      `Created expansion with ${expandedItems.length} items, price adjustment: ${price ? "yes" : "no"}`,
    );

    const expandOperation: ExpandOperation = {
      cartLineId: line.id,
      expandedCartItems: expandedItems,
      price,
    };

    return [{ expand: expandOperation }];
  });
}

function getComponentReferences(variant: any): ID[] {
  if (!variant.component_reference) {
    console.log(`No component_reference for variant ${variant.id}`);
    return [];
  }
  try {
    const refs = JSON.parse(variant.component_reference.value);
    console.log(`Parsed component_reference: ${refs.length} items`);
    return refs;
  } catch (error) {
    console.error("Error parsing component_reference:", error);
    return [];
  }
}

function getComponentQuantities(variant: any): number[] {
  if (!variant.component_quantities) {
    console.log(`No component_quantities for variant ${variant.id}`);
    return [];
  }
  try {
    const qtys = JSON.parse(variant.component_quantities.value);
    console.log(`Parsed component_quantities: ${qtys.length} items`);
    return qtys;
  } catch (error) {
    console.error("Error parsing component_quantities:", error);
    return [];
  }
}

function getPriceAdjustment(variant: any): PriceAdjustment | undefined {
  if (!variant.price_adjustment) return undefined;

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
