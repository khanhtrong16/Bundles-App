import {
  CartLineInput,
  CartOperation,
  ExpandOperation,
  ExpandedItem as ShopifyExpandedItem,
  ExpandedItemPriceAdjustment,
  FunctionRunResult,
  MergeOperation,
  PriceAdjustment,
  Scalars,
} from "../generated/api";

type ID = Scalars["ID"]["input"];

type ComponentParent = {
  id: ID;
  component_reference: ID[];
  component_quantities: number[];
  price_adjustment?: number;
};

type ComponentParentMetafield = {
  id: ID;
  component_reference: { value: string[] };
  component_quantities: { value: number[] };
  price_adjustment?: { value: number };
};

type InputCart = {
  lines: InputCartLine[];
};

type InputCartLine = {
  id: string;
  quantity: number;
  merchandise:
    | InputCartLinesMerchandiseOnProductVariant
    | {
        __typename: string;
      };
};

type InputCartLinesMerchandiseOnProductVariant = {
  __typename: "ProductVariant";
  id: string;
  componentParents?: { value: string } | null;
  componentReference?: { value: string } | null;
  componentQuantities?: { value: string } | null;
  priceAdjustment?: { value: string } | null;
};

export function run(input: { cart: InputCart }): FunctionRunResult {
  //   console.log("input ", JSON.stringify(input, null, 2));

  const cartOperations: CartOperation[] = [
    ...getMergeCartOperations(input.cart),
    ...getExpandCartOperations(input.cart),
  ];
  console.log("cartOperations ", JSON.stringify(cartOperations, null, 2));

  return {
    operations: cartOperations,
  };
}

// merge operation logic

function getMergeCartOperations(cart: InputCart): CartOperation[] {
  const mergeParentDefinitions = getMergeParentDefinitions(cart);
  const cartLines = [...cart.lines];
  console.log("cartLines ", JSON.stringify(cartLines, null, 2));
  return mergeParentDefinitions.flatMap((definition) => {
    const componentsInCart = getComponentsInCart(cartLines, definition);
    if (componentsInCart.length !== definition.component_reference.length) {
      return [];
    }

    const cartLineInputs: CartLineInput[] = componentsInCart.map((c) => ({
      cartLineId: c.cartLineId,
      quantity: c.quantity,
    }));

    const price =
      definition.price_adjustment !== undefined
        ? {
            percentageDecrease: {
              value: definition.price_adjustment,
            },
          }
        : undefined;

    const mergeOperation: MergeOperation = {
      parentVariantId: definition.id,
      title: undefined,
      cartLines: cartLineInputs,
      image: undefined,
      price,
      attributes: undefined,
    };
    console.log("mergeOperation ", JSON.stringify(mergeOperation, null, 2));
    return [{ merge: mergeOperation }];
  });
}

function getComponentsInCart(
  cartLines: InputCart["lines"],
  definition: ComponentParent,
): CartLineInput[] {
  const matched: CartLineInput[] = [];

  for (const [refId, quantity] of definition.component_reference.map(
    (ref, i) => [ref, definition.component_quantities[i]] as [ID, number],
  )) {
    const match = cartLines.find(
      (line) =>
        line.merchandise.__typename === "ProductVariant" &&
        (line.merchandise as InputCartLinesMerchandiseOnProductVariant).id ===
          refId &&
        line.quantity >= quantity,
    );

    if (match) {
      matched.push({ cartLineId: match.id, quantity });
    }
  }

  updateCartLinesFromFunctionResult(cartLines, matched);

  return matched;
}

function updateCartLinesFromFunctionResult(
  cartLines: InputCart["lines"],
  matched: CartLineInput[],
) {
  const tracker = new Map<string, number>();
  for (const line of cartLines) {
    tracker.set(line.id, line.quantity);
  }

  for (const result of matched) {
    const existing = tracker.get(result.cartLineId);
    if (existing !== undefined) {
      tracker.set(result.cartLineId, existing - result.quantity);
    }
  }

  for (const line of cartLines) {
    const newQty = tracker.get(line.id);
    if (newQty !== undefined && newQty > 0) {
      line.quantity = newQty;
    }
  }
}

function getMergeParentDefinitions(cart: InputCart): ComponentParent[] {
  return cart.lines.flatMap((line) => {
    if (line.merchandise.__typename === "ProductVariant") {
      return getComponentParents(
        line.merchandise as InputCartLinesMerchandiseOnProductVariant,
      );
    }
    return [];
  });
}

function getComponentParents(
  variant: InputCartLinesMerchandiseOnProductVariant,
): ComponentParent[] {
  if (!variant.componentParents) return [];

  const metafields: ComponentParentMetafield[] = JSON.parse(
    variant.componentParents.value,
  );

  return metafields.map((parent) => ({
    id: parent.id,
    component_reference: parent.component_reference.value,
    component_quantities: parent.component_quantities.value,
    price_adjustment: parent.price_adjustment?.value,
  }));
}

// expand operation logic

function getExpandCartOperations(cart: InputCart): CartOperation[] {
  return cart.lines.flatMap((line) => {
    if (line.merchandise.__typename === "ProductVariant") {
      const variantMerchandise =
        line.merchandise as InputCartLinesMerchandiseOnProductVariant;
      const references = getComponentReferences(variantMerchandise);
      const quantities = getComponentQuantities(variantMerchandise);

      if (references.length === 0 || references.length !== quantities.length) {
        return [];
      }

      const expandedItems: ShopifyExpandedItem[] = references.map((id, i) => ({
        merchandiseId: id,
        quantity: quantities[i],
        price: undefined,
        attributes: undefined,
      }));

      const price = getPriceAdjustment(variantMerchandise);

      const expandOp: ExpandOperation = {
        cartLineId: line.id,
        expandedCartItems: expandedItems,
        price,
        image: undefined,
        title: undefined,
      };

      return [{ expand: expandOp }];
    }

    return [];
  });
}

function getComponentReferences(
  variant: InputCartLinesMerchandiseOnProductVariant,
): ID[] {
  if (!variant.componentReference) return [];
  return JSON.parse(variant.componentReference.value);
}

function getComponentQuantities(
  variant: InputCartLinesMerchandiseOnProductVariant,
): number[] {
  if (!variant.componentQuantities) return [];
  return JSON.parse(variant.componentQuantities.value);
}

function getPriceAdjustment(
  variant: InputCartLinesMerchandiseOnProductVariant,
): PriceAdjustment | undefined {
  if (!variant.priceAdjustment) return undefined;

  return {
    percentageDecrease: {
      value: parseFloat(variant.priceAdjustment.value),
    },
  };
}
