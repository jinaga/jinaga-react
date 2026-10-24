import { act, renderHook, waitFor } from "@testing-library/react";
import { DistributionDeniedError } from "jinaga";
import { useSpecification } from "../../src";
import { Item, Root, model } from "../model";
import { ControllableNetwork, makeJinaga } from "./controllableNetwork";

const itemsInRoot = model.given(Root).match((root, facts) =>
  facts.ofType(Item).join(item => item.root, root)
);

const root = new Root("root-identifier");

describe("useSpecification distribution decisions", () => {
  it("returns only data, loading and failure", async () => {
    const network = new ControllableNetwork();
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(Object.keys(result.current).sort()).toEqual(["data", "failure", "loading"]);
  });

  it("is the empty state for an authorized feed with no data", async () => {
    const network = new ControllableNetwork();
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current).toEqual({ data: [], loading: false, failure: null });
  });

  it.each([
    ["reactive", { feeds: ["f"], decisions: [{ feed: "f", decision: "reactive" as const, reason: "pending authorization" }] }],
    ["principal-excluded", { feeds: [], decisions: [{ feed: "f", decision: "denied" as const, code: "principal-excluded" as const, reason: "excluded" }] }],
  ])("is the empty state, not a failure, for a %s decision with no data", async (_name, response) => {
    const network = new ControllableNetwork();
    network.response = response;
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current).toEqual({ data: [], loading: false, failure: null });
  });

  it.each([
    ["no-matching-rule"],
    ["spec-more-restrictive-than-rule"],
    ["not-authenticated"],
  ] as const)("is a failure that retrying cannot fix for a %s denial", async (code) => {
    const network = new ControllableNetwork();
    network.response = { feeds: [], decisions: [{ feed: "f", decision: "denied", code, reason: `denied: ${code}` }] };
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    expect(result.current.failure?.error).toBeInstanceOf(DistributionDeniedError);
    expect(result.current.failure?.retry).toBeNull();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("reports a structural denial even when a sibling feed is only pending", async () => {
    const network = new ControllableNetwork();
    network.response = {
      feeds: [],
      decisions: [
        { feed: "pending", decision: "denied", code: "principal-excluded", reason: "excluded" },
        { feed: "broken", decision: "denied", code: "no-matching-rule", reason: "no rule" },
      ],
    };
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    expect(result.current.failure?.error).toBeInstanceOf(DistributionDeniedError);
    expect(result.current.failure?.retry).toBeNull();
  });

  it("replaces a retry's failure with a structural denial that arrives during it", async () => {
    const network = new ControllableNetwork();
    network.failing = true;
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    network.failing = false;
    network.response = { feeds: [], decisions: [{ feed: "f", decision: "denied", code: "no-matching-rule", reason: "no rule" }] };
    act(() => result.current.failure!.retry!());

    await waitFor(() => expect(result.current.failure?.error).toBeInstanceOf(DistributionDeniedError));
    expect(result.current.failure).toEqual({ error: expect.any(DistributionDeniedError), retry: null, retrying: false });
    expect(result.current.loading).toBe(false);
  });

  it("shows rows that arrive after a reactive decision", async () => {
    const network = new ControllableNetwork();
    network.response = { feeds: ["f"], decisions: [{ feed: "f", decision: "reactive", reason: "pending authorization" }] };
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.data).toEqual([]));

    // The authorizing fact arrives locally (e.g. via a sibling subscribe), and
    // the watch's inverse listeners deliver the row.
    await act(async () => {
      await j.fact(new Item(root, new Date(1000)));
    });

    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(result.current.failure).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
