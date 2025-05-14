import {
  CartLineInput,
  CartOperation,
  ExpandOperation,
  ExpandedItem as ShopifyExpandedItem,
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
  component_parents?: { value: string } | null;
  component_reference?: { value: string } | null;
  component_quantities?: { value: string } | null;
  price_adjustment?: { value: string } | null;
};

export function run(input: { cart: InputCart }): FunctionRunResult {
  const mergeOperations = getMergeCartOperations(input.cart);
  const expandOperations = getExpandCartOperations(input.cart);
  const quantityAdjustmentOperations = getQuantityAdjustmentOperations(
    input.cart,
  );
  const cartOperations = removeDuplicateOperations([
    ...mergeOperations,
    ...expandOperations,
  ]);

  console.log(
    "cartOperations cuối cùng:",
    JSON.stringify(cartOperations, null, 2),
  );
  return {
    operations: cartOperations,
  };
}

// Function to remove duplicate operations - improved version
function removeDuplicateOperations(
  operations: CartOperation[],
): CartOperation[] {
  // Track processed cartLineIds to prevent duplicate expansions
  const processedExpandLineIds = new Set<string>();
  const processedMergeParentIds = new Set<string>();

  const filteredOperations: CartOperation[] = [];

  for (const operation of operations) {
    // Handle expand operations
    if ("expand" in operation && operation.expand) {
      const cartLineId = operation.expand.cartLineId;

      // Skip if this cartLineId has already been processed
      if (cartLineId && processedExpandLineIds.has(cartLineId)) {
        continue;
      }

      filteredOperations.push(operation);
      if (cartLineId) {
        processedExpandLineIds.add(cartLineId);
      }
    }
    // Handle merge operations
    else if ("merge" in operation && operation.merge) {
      const parentVariantId = operation.merge.parentVariantId as string;

      // Skip if this parent variant has already been processed
      if (parentVariantId && processedMergeParentIds.has(parentVariantId)) {
        continue;
      }

      filteredOperations.push(operation);
      if (parentVariantId) {
        processedMergeParentIds.add(parentVariantId);
      }
    }
    // Handle any other type of operation
    else {
      filteredOperations.push(operation);
    }
  }

  return filteredOperations;
}

// merge operation logic

function getMergeCartOperations(cart: InputCart): CartOperation[] {
  const mergeParentDefinitions = getMergeParentDefinitions(cart);
  const cartLines = [...cart.lines];

  // Track processed parent variant IDs to prevent duplicates
  const processedParentVariants = new Set<string>();
  const results: CartOperation[] = [];

  for (const definition of mergeParentDefinitions) {
    // Skip if we've already processed this parent variant
    if (processedParentVariants.has(definition.id as string)) {
      continue;
    }

    const componentsInCart = getComponentsInCart(cartLines, definition);
    if (componentsInCart.length !== definition.component_reference.length) {
      continue;
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
    const references = getComponentReferences(variantMerchandise);
    const quantities = getComponentQuantities(variantMerchandise);

    // Skip if not a bundle (no components)
    if (references.length === 0 || references.length !== quantities.length) {
      continue;
    }

    const mergeOperation: MergeOperation = {
      parentVariantId: definition.id,
      title: undefined,
      cartLines: cartLineInputs,
      image: undefined,
      price,
      attributes: undefined,
    };

    results.push({ merge: mergeOperation });
    processedParentVariants.add(definition.id as string);
  }
  // console.log("results đây:", JSON.stringify(results, null, 2));
  return results;
}

// get components in cart
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
        (line.merchandise as InputCartLinesMerchandiseOnProductVariant).id ===
          refId && line.quantity >= quantity,
    );
    if (match) {
      matched.push({ cartLineId: match.id, quantity });
    }
  }
  updateCartLinesFromFunctionResult(cartLines, matched);

  return matched;
}

// update cart lines from function result
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
    return getComponentParents(
      line.merchandise as InputCartLinesMerchandiseOnProductVariant,
    );
  });
}

function getComponentParents(
  variant: InputCartLinesMerchandiseOnProductVariant,
): ComponentParent[] {
  if (!variant.component_parents) return [];
  const metafields: ComponentParentMetafield[] = JSON.parse(
    variant.component_parents.value,
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
  const processedLineIds = new Set<string>();
  const result: CartOperation[] = [];

  for (const line of cart.lines) {
    // Skip if already processed
    if (processedLineIds.has(line.id)) {
      continue;
    }

    const variantMerchandise =
      line.merchandise as InputCartLinesMerchandiseOnProductVariant;

    const references = getComponentReferences(variantMerchandise);
    const quantities = getComponentQuantities(variantMerchandise);

    // Skip if not a bundle (no components)
    if (references.length === 0 || references.length !== quantities.length) {
      continue;
    }

    // Skip bundles with quantity > 1, they're handled by getQuantityAdjustmentOperations
    if (line.quantity > 1) {
      continue;
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
      title: "Bundle Components",
    };

    result.push({ expand: expandOp });
    processedLineIds.add(line.id);
  }

  return result;
}

function getComponentReferences(
  variant: InputCartLinesMerchandiseOnProductVariant,
): ID[] {
  if (!variant.component_reference) return [];
  return JSON.parse(variant.component_reference.value);
}

function getComponentQuantities(
  variant: InputCartLinesMerchandiseOnProductVariant,
): number[] {
  if (!variant.component_quantities) return [];
  return JSON.parse(variant.component_quantities.value);
}

function getPriceAdjustment(
  variant: InputCartLinesMerchandiseOnProductVariant,
): PriceAdjustment | undefined {
  if (!variant.price_adjustment) return undefined;

  return {
    percentageDecrease: {
      value: parseFloat(variant.price_adjustment.value),
    },
  };
}

// Function to handle quantity adjustments for parent products
function getQuantityAdjustmentOperations(cart: InputCart): CartOperation[] {
  const operations: CartOperation[] = [];
  const processedLineIds = new Set<string>();

  for (const line of cart.lines) {
    // Skip if already processed
    if (processedLineIds.has(line.id)) continue;

    const variantMerchandise =
      line.merchandise as InputCartLinesMerchandiseOnProductVariant;
    if (variantMerchandise.__typename !== "ProductVariant") continue;

    const references = getComponentReferences(variantMerchandise);
    const baseQuantities = getComponentQuantities(variantMerchandise);

    // Skip if not a bundle with components
    if (
      references.length === 0 ||
      references.length !== baseQuantities.length
    ) {
      continue;
    }

    // Only process bundles with quantity > 1
    if (line.quantity > 1) {
      // Tạo các expanded items với số lượng nhân theo số lượng bundle cha
      const expandedItems: ShopifyExpandedItem[] = references.map((id, i) => ({
        merchandiseId: id,
        // Số lượng thành phần = số lượng cơ bản * số lượng bundle cha
        quantity: baseQuantities[i] * line.quantity,
        price: undefined,
        attributes: undefined,
      }));

      const price = getPriceAdjustment(variantMerchandise);

      const expandOp: ExpandOperation = {
        cartLineId: line.id,
        expandedCartItems: expandedItems,
        price,
        image: undefined,
        title: `Bundle (${line.quantity}x)`,
      };

      operations.push({ expand: expandOp });
      processedLineIds.add(line.id);
    }
  }

  return operations;
}
