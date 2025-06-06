import { describe, it, expect } from "vitest";
import { run } from "./run";

describe("cart transform function", () => {
  it("returns NO_CHANGES when cart is empty", () => {
    expect(
      run({
        cart: {
          lines: [],
        },
      }),
    ).toStrictEqual({ operations: [] });
  });

  it("returns NO_CHANGES when cart contains no bundles", () => {
    expect(
      run({
        cart: {
          lines: [
            {
              id: "1",
              merchandise: {
                __typename: "ProductVariant",
                componentReferences: null,
                componentQuantities: null,
              },
            },
          ],
        },
      }),
    ).toStrictEqual({ operations: [] });
  });

  it("returns operations when cart contains a bundle", () => {
    expect(
      run({
        cart: {
          lines: [
            {
              id: "1",
              merchandise: {
                __typename: "ProductVariant",
                componentReferences: { value: JSON.stringify(["2", "3"]) },
                componentQuantities: { value: JSON.stringify([1, 2]) },
              },
            },
          ],
        },
      }),
    ).toStrictEqual({
      operations: [
        {
          expand: {
            cartLineId: "1",
            expandedCartItems: [
              {
                merchandiseId: "2",
                quantity: 1,
              },
              {
                merchandiseId: "3",
                quantity: 2,
              },
            ],
          },
        },
      ],
    });
  });

  describe("error cases", () => {
    it("throws an error when componentReferences and componentQuantities lengths are not equal", () => {
      expect(() =>
        run({
          cart: {
            lines: [
              {
                id: "1",
                merchandise: {
                  __typename: "ProductVariant",
                  componentReferences: { value: JSON.stringify(["2", "3"]) },
                  componentQuantities: { value: JSON.stringify([1]) },
                },
              },
            ],
          },
        }),
      ).toThrow("Invalid bundle composition");
    });

    it("throws an error when componentReferences length is 0", () => {
      expect(() =>
        run({
          cart: {
            lines: [
              {
                id: "1",
                merchandise: {
                  __typename: "ProductVariant",
                  componentReferences: { value: JSON.stringify([]) },
                  componentQuantities: { value: JSON.stringify([]) },
                },
              },
            ],
          },
        }),
      ).toThrow("Invalid bundle composition");
    });
    it("returns correct expand operation for a valid bundle", () => {
      const result = run({
        cart: {
          lines: [
            {
              id: "bundle-123",
              merchandise: {
                __typename: "ProductVariant",
                componentReferences: {
                  value: JSON.stringify(["sku-1", "sku-2"]),
                },
                componentQuantities: { value: JSON.stringify([5, 10]) },
              },
            },
          ],
        },
      });

      expect(result).toStrictEqual({
        operations: [
          {
            expand: {
              cartLineId: "bundle-123",
              expandedCartItems: [
                { merchandiseId: "sku-1", quantity: 5 },
                { merchandiseId: "sku-2", quantity: 10 },
              ],
            },
          },
        ],
      });
    });
  });
});
