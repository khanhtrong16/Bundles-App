import {
  Cart,
  FunctionRunResult,
  ExpandedItem,
  ExpandOperation,
  CartOperation,
} from "@shopify/shopify_function";

export function run(input: { cart: Cart }): FunctionRunResult {
  const operations: CartOperation[] = [];

  input.cart.lines.forEach((line) => {
    const merchandise = line.merchandise;
    if (merchandise.__typename === "ProductVariant") {
      const variant = merchandise;
      const componentReferences = getComponentReferences(variant);

      if (componentReferences.length > 0) {
        const expandedItems: ExpandedItem[] = componentReferences.map((id) => ({
          merchandiseId: id,
          quantity: 1,
          price: undefined,
          attributes: undefined,
        }));

        const expandOperation: ExpandOperation = {
          cartLineId: line.id,
          expandedCartItems: expandedItems,
          price: undefined,
          image: undefined,
          title: undefined,
        };

        operations.push({ expand: expandOperation });
      }
    }
  });

  return { operations };
}

function getComponentReferences(variant: {
  metafield?: { value: string };
}): string[] {
  if (variant.metafield) {
    try {
      return JSON.parse(variant.metafield.value);
    } catch (error) {
      console.error("Error parsing component references:", error);
    }
  }
  return [];
}
