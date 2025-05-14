export * from "./run";

// Types for component parent data
export interface ComponentParent {
  id: string;
  component_reference: string[];
  component_quantities: number[];
  price_adjustment?: number;
}

export interface ComponentParentMetafield {
  id: string;
  component_reference: ComponentParentMetafieldReference;
  component_quantities: ComponentParentMetafieldQuantities;
  price_adjustment?: ComponentParentMetafieldPriceAdjustment;
}

export interface ComponentParentMetafieldReference {
  value: string[];
}

export interface ComponentParentMetafieldQuantities {
  value: number[];
}

export interface ComponentParentMetafieldPriceAdjustment {
  value: number;
}

// Cart line representation for merging operations
export interface CartLineInput {
  cart_line_id: string;
  quantity: number;
}
