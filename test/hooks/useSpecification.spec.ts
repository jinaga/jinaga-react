import { act, renderHook, waitFor } from "@testing-library/react";
import { JinagaTest } from "jinaga";
import { useSpecification } from "../../src";
import { Item, ItemDeleted, ItemDescription, Root, model } from "../model";

const itemsInRoot = model.given(Root).match((root, facts) =>
  facts.ofType(Item)
    .join(item => item.root, root)
    .notExists(item => facts.ofType(ItemDeleted)
      .join(deleted => deleted.item, item)
    )
);

const descriptionsOfItem = model.given(Item).match((item, facts) =>
  facts.ofType(ItemDescription)
    .join(description => description.item, item)
    .notExists(description => facts.ofType(ItemDescription)
      .join(next => next.prior, description)
    )
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

  it("should add an item", async () => {
    const j = JinagaTest.create({});
    const root = await j.fact(new Root("root-identifier"));

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();

    const item = await j.fact(new Item(root, new Date()));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(roundTrip(result.current.data)).toEqual(roundTrip([item]));
  });

  it("should remove an item", async () => {
    const j = JinagaTest.create({});
    const root = await j.fact(new Root("root-identifier"));
    const item = await j.fact(new Item(root, new Date()));

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();

    await j.fact(new ItemDeleted(item));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual([]);
  });

  it("should return one description", async () => {
    const j = JinagaTest.create({});
    const root = await j.fact(new Root("root-identifier"));
    const item = await j.fact(new Item(root, new Date()));
    const description = await j.fact(new ItemDescription(item, "description", []));

    const { result } = renderHook(() => useSpecification(j, descriptionsOfItem, item));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(roundTrip(result.current.data)).toEqual(roundTrip([description]));
  });

  it("should return a replaced description", async () => {
    const j = JinagaTest.create({});
    const root = await j.fact(new Root("root-identifier"));
    const item = await j.fact(new Item(root, new Date()));
    const description = await j.fact(new ItemDescription(item, "description", []));
    const replacement = await j.fact(new ItemDescription(item, "replacement", [description]));

    const { result } = renderHook(() => useSpecification(j, descriptionsOfItem, item));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(roundTrip(result.current.data)).toEqual(roundTrip([replacement]));
  });

  it("should update on edit", async () => {
    const j = JinagaTest.create({});
    const root = await j.fact(new Root("root-identifier"));
    const item = await j.fact(new Item(root, new Date()));
    const description = await j.fact(new ItemDescription(item, "description", []));

    const { result } = renderHook(() => useSpecification(j, descriptionsOfItem, item));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(roundTrip(result.current.data)).toEqual(roundTrip([description]));

    const replacement = await j.fact(new ItemDescription(item, "description", [description]));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(roundTrip(result.current.data)).toEqual(roundTrip([replacement]));
  });

  it("should return candidates for a concurrent edit", async () => {
    const j = JinagaTest.create({});
    const root = await j.fact(new Root("root-identifier"));
    const item = await j.fact(new Item(root, new Date()));
    const description = await j.fact(new ItemDescription(item, "description", []));
    const candidate1 = await j.fact(new ItemDescription(item, "candidate1", [description]));
    const candidate2 = await j.fact(new ItemDescription(item, "candidate2", [description]));

    const { result } = renderHook(() => useSpecification(j, descriptionsOfItem, item));
    await waitFor(() => {
      expect(result.current.data).toBeTruthy();
    });
    expect(result.current.loading).toBeFalsy();
    expect(result.current.error).toBeNull();
    expect(roundTrip(result.current.data?.length)).toBe(2);
    expect(roundTrip(result.current.data)).toContainEqual(roundTrip(candidate1));
    expect(roundTrip(result.current.data)).toContainEqual(roundTrip(candidate2));
  });

  it("should show both items when two are added simultaneously", async () => {
    const j = JinagaTest.create({});
    const root = await j.fact(new Root("root-identifier"));

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    await act(async () => {
      await Promise.all([
        j.fact(new Item(root, new Date(1000))),
        j.fact(new Item(root, new Date(2000))),
      ]);
    });

    await waitFor(() => {
      expect(result.current.data?.length).toBe(2);
    });
  });

  it("should not use stale watch state when given fact changes", async () => {
    const j = JinagaTest.create({});
    const root1 = await j.fact(new Root("root-1"));
    const root2 = await j.fact(new Root("root-2"));
    const itemInRoot2 = await j.fact(new Item(root2, new Date()));

    let currentRoot = root1;
    const { result, rerender } = renderHook(() => useSpecification(j, itemsInRoot, currentRoot));

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });
    expect(result.current.data).toEqual([]);

    // Switch to root2, which already has an item
    currentRoot = root2;
    rerender();

    await waitFor(() => {
      expect(result.current.data?.length).toBe(1);
    });
    expect(roundTrip(result.current.data)).toContainEqual(roundTrip(itemInRoot2));
  });
});

function roundTrip<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}