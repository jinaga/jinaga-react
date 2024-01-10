import { renderHook, waitFor } from "@testing-library/react";
import { JinagaTest } from "jinaga";
import { useSpecification } from "../../src";
import { Item, Root, model } from "../model";

const itemsInRoot = model.given(Root).match((root, facts) =>
  facts.ofType(Item)
    .join(item => item.root, root)
);

describe("useSpecification", () => {
  it("should return an empty list", async () => {
    const j = JinagaTest.create({});
    const root = await j.fact(new Root("root-identifier"));

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([]);
  });

  it("should return one item", async () => {
    const j = JinagaTest.create({});
    const root = await j.fact(new Root("root-identifier"));
    const item = await j.fact(new Item(root, new Date()));

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(roundTrip(result.current.data)).toEqual(roundTrip([item]));
  });
});

function roundTrip<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}