import {
  CartLineInput,
  CartOperation,
  ExpandOperation,
  Input,
  MergeOperation,
  PriceAdjustment,
} from "../generated/api";
import { FunctionRunResult } from "../generated/api";

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
            percentage_decrease: {
              value: new Decimal(definition.price_adjustment),
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
      const variant = line.merchandise;

      const parents = getComponentParents(variant);
      definitions.push(...parents);
    }
  }

  return definitions;
}

function getComponentParents(
  variant: Input["cart"]["lines"][number]["merchandise"] & {
    __typename: "ProductVariant";
  },
): ComponentParent[] {
  if (!variant.componentParents) return [];

  const value: ComponentParentMetafield[] = JSON.parse(
    variant.componentParents.value,
  );

  return value.map((parent) => ({
    id: parent.id,
    component_reference: parent.component_reference.value,
    component_quantities: parent.component_quantities.value,
    price_adjustment: parent.price_adjustment?.value,
  }));
}

// ---------------------- Expand Logic ----------------------

function getExpandCartOperations(cart: Input["cart"]): CartOperation[] {
  return cart.lines.flatMap((line) => {
    if (line.merchandise.__typename !== "ProductVariant") return [];

    const variant = line.merchandise;
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

function getComponentReferences(
  variant: Input["cart"]["lines"][number]["merchandise"] & {
    __typename: "ProductVariant";
  },
): ID[] {
  if (!variant.componentReference) return [];
  return JSON.parse(variant.componentReference.value);
}

function getComponentQuantities(
  variant: Input["cart"]["lines"][number]["merchandise"] & {
    __typename: "ProductVariant";
  },
): number[] {
  if (!variant.componentQuantities) return [];
  return JSON.parse(variant.componentQuantities.value);
}

function getPriceAdjustment(
  variant: Input["cart"]["lines"][number]["merchandise"] & {
    __typename: "ProductVariant";
  },
): PriceAdjustment | undefined {
  if (!variant.priceAdjustment) return undefined;

  return {
    percentage_decrease: {
      value: new Decimal(parseFloat(variant.priceAdjustment.value)),
    },
  };
}
