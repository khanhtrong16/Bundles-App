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

  const mergeOps = getMergeCartOperations(cart);
  const expandOps = getExpandCartOperations(cart);
  console.log("mergeOps", JSON.stringify(mergeOps, null, 2));
  console.log("expandOps", JSON.stringify(expandOps, null, 2));

  return {
    operations: [...mergeOps, ...expandOps],
  };
}

// ---------------------- Merge Logic ----------------------

function getMergeCartOperations(cart: Input["cart"]): CartOperation[] {
  const mergeParentDefs = getMergeParentDefinitions(cart);
  const mutableLines = [...cart.lines];

  return mergeParentDefs.flatMap((definition) => {
    const componentsInCart = getComponentsInCart(mutableLines, definition);
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

  for (let i = 0; i < definition.component_reference.length; i++) {
    const refId = definition.component_reference[i];
    const requiredQty = definition.component_quantities[i];

    const foundLine = cartLines.find((line) => {
      const merch =
        line.merchandise.__typename === "ProductVariant"
          ? line.merchandise
          : null;
      return merch?.id === refId && line.quantity >= requiredQty;
    });

    if (foundLine) {
      result.push({ cartLineId: foundLine.id, quantity: requiredQty });
      foundLine.quantity -= requiredQty; // update quantity
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
  return cart.lines.flatMap((line) => {
    if (line.merchandise.__typename !== "ProductVariant") return [];

    const variant = line.merchandise as any;
    const componentRefs = getComponentReferences(variant);
    const componentQtys = getComponentQuantities(variant);

    if (
      componentRefs.length === 0 ||
      componentRefs.length !== componentQtys.length
    ) {
      return [];
    }

    const expandedItems = componentRefs.map((id, i) => ({
      merchandiseId: id,
      quantity: componentQtys[i],
    }));

    const price = getPriceAdjustment(variant);

    const expandOperation: ExpandOperation = {
      cartLineId: line.id,
      expandedCartItems: expandedItems,
      price,
    };

    return [{ expand: expandOperation }];
  });
}

function getComponentReferences(variant: any): ID[] {
  if (!variant.component_reference) return [];
  try {
    return JSON.parse(variant.component_reference.value);
  } catch (error) {
    console.error("Error parsing component_reference:", error);
    return [];
  }
}

function getComponentQuantities(variant: any): number[] {
  if (!variant.component_quantities) return [];
  try {
    return JSON.parse(variant.component_quantities.value);
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
