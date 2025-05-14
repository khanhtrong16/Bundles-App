import type { RunInput, FunctionRunResult } from "../generated/api";

const NO_CHANGES: FunctionRunResult = {
  operations: [],
};

export function run(input: RunInput): FunctionRunResult {
  console.log("input đây", JSON.stringify(input, null, 2));

  return NO_CHANGES;
}
