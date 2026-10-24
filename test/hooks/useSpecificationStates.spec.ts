import { act, renderHook, waitFor } from "@testing-library/react";
import { Jinaga } from "jinaga";
import { SpecificationResult, useSpecification } from "../../src";
import { Item, Root, model } from "../model";
import { ControllableNetwork, makeJinaga } from "./controllableNetwork";

// Each test reaches one row of the table in issue #27 through a real Jinaga
// instance. `data`, `loading` and `failure` are independent: every
// combination of the three tells the UI something different.

const itemsInRoot = model.given(Root).match((root, facts) =>
  facts.ofType(Item).join(item => item.root, root)
);

const root = new Root("root-identifier");

function render(j: Jinaga, given: Root | null = root) {
  const renders: SpecificationResult<Item>[] = [];
  const hook = renderHook(() => {
    const r = useSpecification(j, itemsInRoot, given);
    renders.push(r);
    return r;
  });
  return { ...hook, renders };
}

// Load the specification once so that the next watch finds it in the cache.
async function warmCache(j: Jinaga) {
  const { result, unmount } = render(j);
  await waitFor(() => expect(result.current.data?.length).toBe(1));
  unmount();
}

async function withOneItem(network: ControllableNetwork) {
  const j = makeJinaga(network);
  await j.fact(new Item(root, new Date(1000)));
  return j;
}

describe("useSpecification result combinations", () => {
  it("row 1: shows nothing before the answer arrives", async () => {
    const network = new ControllableNetwork();
    const release = network.hold();
    const j = await withOneItem(network);

    const { renders } = render(j);
    expect(renders[0]).toEqual({ data: null, loading: false, failure: null });
    release();
  });

  it("row 1: shows nothing while a given is null", async () => {
    const network = new ControllableNetwork();
    const j = await withOneItem(network);

    const { result } = render(j, null);
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toEqual({ data: null, loading: false, failure: null });
  });

  it("row 2: shows an indicator while a cold load is underway", async () => {
    const network = new ControllableNetwork();
    const release = network.hold();
    const j = await withOneItem(network);

    const { result } = render(j);
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.failure).toBeNull();

    await act(async () => release());
    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(result.current.loading).toBe(false);
  });

  it("row 3: shows a retryable failure when a cold load is refused", async () => {
    const network = new ControllableNetwork();
    network.failing = true;
    const j = await withOneItem(network);

    const { result } = render(j);
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.failure?.error.message).toMatch(/ECONNREFUSED/);
    expect(result.current.failure?.retry).toBeInstanceOf(Function);
  });

  it("row 4: keeps the failure while a retry is underway, then shows the rows", async () => {
    const network = new ControllableNetwork();
    network.failing = true;
    const j = await withOneItem(network);

    const { result, renders } = render(j);
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    const error = result.current.failure!.error;

    network.failing = false;
    const release = network.hold();
    const before = renders.length;
    act(() => result.current.failure!.retry!());

    await waitFor(() => expect(result.current.failure?.retrying).toBe(true));
    // The retry found nothing cached and is now waiting on the network.
    await waitFor(() => expect(network.held).toBeGreaterThan(0));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.failure?.error).toBe(error);

    await act(async () => release());
    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(result.current.loading).toBe(false);
    expect(result.current.failure).toBeNull();

    const during = renders.slice(before);
    // A retry never shows as loading.
    expect(during.every(r => r.loading === false)).toBe(true);
    // The failure clears in the same render that delivers the answer.
    expect(during.every(r => (r.data === null) === (r.failure !== null))).toBe(true);
  });

  it("row 5: shows cached rows without an indicator", async () => {
    const network = new ControllableNetwork();
    const j = await withOneItem(network);
    await warmCache(j);

    const release = network.hold();
    const { result, renders } = render(j);
    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(result.current.failure).toBeNull();
    await act(async () => release());

    expect(renders.every(r => r.loading === false)).toBe(true);
    expect(result.current).toEqual({ data: [expect.anything()], loading: false, failure: null });
  });

  it("row 7: keeps cached rows when the refresh is refused", async () => {
    const network = new ControllableNetwork();
    const j = await withOneItem(network);
    await warmCache(j);

    network.failing = true;
    const { result, renders } = render(j);
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    expect(result.current.data?.length).toBe(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.failure?.retry).toBeInstanceOf(Function);
    expect(renders.every(r => r.loading === false)).toBe(true);
  });

  it("row 8: keeps cached rows and the failure while a retry is underway", async () => {
    const network = new ControllableNetwork();
    const j = await withOneItem(network);
    await warmCache(j);

    network.failing = true;
    const { result, renders } = render(j);
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    network.failing = false;
    const release = network.hold();
    const before = renders.length;
    act(() => result.current.failure!.retry!());

    await waitFor(() => expect(result.current.failure?.retrying).toBe(true));
    expect(result.current.data?.length).toBe(1);
    expect(result.current.loading).toBe(false);

    await act(async () => release());
    await waitFor(() => expect(result.current.failure).toBeNull());
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.length).toBe(1);
    // The rows never disappear and no indicator shows during the retry.
    expect(renders.slice(before).every(r => r.data?.length === 1 && r.loading === false)).toBe(true);
  });

  it("replaces the failure with the retry's failure", async () => {
    const network = new ControllableNetwork();
    network.failing = true;
    const j = await withOneItem(network);

    const { result, renders } = render(j);
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    const first = result.current.failure!;

    const release = network.hold();
    const before = renders.length;
    act(() => first.retry!());
    await waitFor(() => expect(result.current.failure?.retrying).toBe(true));
    await waitFor(() => expect(network.held).toBeGreaterThan(0));

    await act(async () => release());
    await waitFor(() => expect(result.current.failure?.retrying).toBe(false));
    expect(result.current.failure?.error).not.toBe(first.error);
    expect(result.current.failure?.error.message).toMatch(/ECONNREFUSED/);
    expect(result.current.failure?.retry).toBeInstanceOf(Function);
    expect(result.current.data).toBeNull();
    expect(renders.slice(before).every(r => r.loading === false && r.failure !== null)).toBe(true);
  });

  it("shows rows found in the cache while the retry is still underway", async () => {
    const network = new ControllableNetwork();
    network.failing = true;
    const j = await withOneItem(network);

    const { result } = render(j);
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    // Another view loads the same specification, so the retry finds it cached.
    network.failing = false;
    await warmCache(j);

    const release = network.hold();
    act(() => result.current.failure!.retry!());
    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(result.current.failure?.retrying).toBe(true);
    expect(result.current.loading).toBe(false);

    // The failure clears only when the retry completes.
    await act(async () => release());
    await waitFor(() => expect(result.current.failure).toBeNull());
    expect(result.current.data?.length).toBe(1);
  });

  it("starts one attempt when retry is called twice", async () => {
    const network = new ControllableNetwork();
    network.failing = true;
    const j = await withOneItem(network);
    const watch = jest.spyOn(j, "watch");

    const { result } = render(j);
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    const retry = result.current.failure!.retry!;
    const watches = watch.mock.calls.length;

    network.failing = false;
    const release = network.hold();
    act(() => retry());
    await waitFor(() => expect(result.current.failure?.retrying).toBe(true));
    // A second call, from this copy or the one on the current failure, does nothing.
    act(() => retry());
    act(() => result.current.failure!.retry!());
    expect(watch.mock.calls.length).toBe(watches + 1);

    await act(async () => release());
    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(watch.mock.calls.length).toBe(watches + 1);
  });

  it("ignores a retry once the failure has cleared", async () => {
    const network = new ControllableNetwork();
    const j = await withOneItem(network);
    await warmCache(j);

    network.failing = true;
    const watch = jest.spyOn(j, "watch");
    const { result } = render(j);
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    const retry = result.current.failure!.retry!;

    network.failing = false;
    act(() => retry());
    await waitFor(() => expect(result.current.failure).toBeNull());

    const watches = watch.mock.calls.length;
    act(() => retry());
    await act(async () => { await Promise.resolve(); });
    expect(watch.mock.calls.length).toBe(watches);
    expect(result.current).toEqual({ data: [expect.anything()], loading: false, failure: null });
  });

  it("shows loading again for the first attempt of a new given", async () => {
    const network = new ControllableNetwork();
    network.failing = true;
    const j = await withOneItem(network);

    let given = root;
    const { result, rerender } = renderHook(() => useSpecification(j, itemsInRoot, given));
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    network.failing = false;
    const release = network.hold();
    given = new Root("other-root");
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.failure).toBeNull();
    expect(result.current.data).toBeNull();

    await act(async () => release());
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(result.current.loading).toBe(false);
  });

  it("ignores a retry from a previous given", async () => {
    const network = new ControllableNetwork();
    network.failing = true;
    const j = await withOneItem(network);

    let given = root;
    const { result, rerender } = renderHook(() => useSpecification(j, itemsInRoot, given));
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    const staleRetry = result.current.failure!.retry!;

    network.failing = false;
    given = new Root("other-root");
    rerender();
    await waitFor(() => expect(result.current.data).toEqual([]));

    act(() => staleRetry());
    expect(result.current).toEqual({ data: [], loading: false, failure: null });
  });
});
