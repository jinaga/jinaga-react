import { act, renderHook, waitFor } from "@testing-library/react";
import {
  AuthenticationNoOp,
  DistributionDeniedError,
  FactEnvelope,
  FactManager,
  FactReference,
  FeedResponse,
  FeedsResponse,
  Jinaga,
  MemoryStore,
  ObservableSource,
  PassThroughFork,
  Specification,
} from "jinaga";
import type { Network } from "jinaga";
import { useSpecification } from "../../src";
import { Item, Root, model } from "../model";

const itemsInRoot = model.given(Root).match((root, facts) =>
  facts.ofType(Item).join(item => item.root, root)
);

// A Network double that reports caller-configured feed hashes and per-feed
// distribution decisions, exactly as a replicator's POST /feeds does (issue
// #207). JinagaTest's in-process NetworkDistribution throws on denial and never
// surfaces decisions, so a real replicator response has to be simulated here.
class DecisionNetwork implements Network {
  public response: FeedsResponse = { feeds: [] };

  feeds(_start: FactReference[], _specification: Specification): Promise<FeedsResponse> {
    return Promise.resolve(this.response);
  }

  fetchFeed(_feed: string, bookmark: string): Promise<FeedResponse> {
    return Promise.resolve({ references: [], bookmark });
  }

  streamFeed(
    _feed: string,
    bookmark: string,
    onResponse: (factReferences: FactReference[], nextBookmark: string) => Promise<void>,
    _onError: (err: Error) => void,
    _feedRefreshIntervalSeconds: number
  ): () => void {
    Promise.resolve().then(() => onResponse([], bookmark));
    return () => {};
  }

  load(_factReferences: FactReference[]): Promise<FactEnvelope[]> {
    return Promise.resolve([]);
  }

  intersectForSubscribe(start: FactReference[], specification: Specification) {
    return Promise.resolve([{ start, specification }]);
  }
}

function makeJinaga(network: Network): Jinaga {
  const store = new MemoryStore();
  const factManager = new FactManager(new PassThroughFork(store), new ObservableSource(store), store, network, []);
  return new Jinaga(new AuthenticationNoOp(), factManager, null);
}

const root = new Root("root-identifier");

describe("useSpecification distribution signals (issue #179)", () => {
  it("is quiet for an authorized feed — no pending, no error", async () => {
    const network = new DecisionNetwork();
    network.response = { feeds: ["f"], decisions: [{ feed: "f", decision: "authorized", reason: "" }] };
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.error).toBeNull();
    expect(result.current.distributionPending).toBe(false);
    expect(result.current.distributionDiagnostic).toBeNull();
    expect(result.current.data).toEqual([]);
  });

  it("sets distributionPending (not error) for a reactive decision", async () => {
    const network = new DecisionNetwork();
    network.response = { feeds: ["f"], decisions: [{ feed: "f", decision: "reactive", reason: "pending authorization" }] };
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.distributionPending).toBe(true));

    expect(result.current.error).toBeNull();
    expect(result.current.distributionDiagnostic?.decision).toBe("reactive");
    expect(result.current.data).toEqual([]);
  });

  it("sets distributionPending (not error) for a principal-excluded denial", async () => {
    const network = new DecisionNetwork();
    network.response = { feeds: [], decisions: [{ feed: "f", decision: "denied", code: "principal-excluded", reason: "excluded" }] };
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.distributionPending).toBe(true));

    expect(result.current.error).toBeNull();
    expect(result.current.distributionDiagnostic?.code).toBe("principal-excluded");
  });

  it.each([
    ["no-matching-rule"],
    ["spec-more-restrictive-than-rule"],
    ["not-authenticated"],
  ] as const)("sets error (not pending) for a %s denial", async (code) => {
    const network = new DecisionNetwork();
    network.response = { feeds: [], decisions: [{ feed: "f", decision: "denied", code, reason: `denied: ${code}` }] };
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.error).toBeInstanceOf(DistributionDeniedError);
    expect(result.current.distributionPending).toBe(false);
    expect(result.current.distributionDiagnostic?.code).toBe(code);
    expect(result.current.data).toBeNull();
  });

  it("lets an error-class denial outrank a pending sibling feed", async () => {
    const network = new DecisionNetwork();
    network.response = {
      feeds: [],
      decisions: [
        { feed: "pending", decision: "denied", code: "principal-excluded", reason: "excluded" },
        { feed: "broken", decision: "denied", code: "no-matching-rule", reason: "no rule" },
      ],
    };
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.distributionPending).toBe(false);
    expect(result.current.distributionDiagnostic?.code).toBe("no-matching-rule");
  });

  it("clears distributionPending when the first result arrives (the race resolves)", async () => {
    const network = new DecisionNetwork();
    network.response = { feeds: ["f"], decisions: [{ feed: "f", decision: "reactive", reason: "pending authorization" }] };
    const j = makeJinaga(network);

    const { result } = renderHook(() => useSpecification(j, itemsInRoot, root));
    await waitFor(() => expect(result.current.distributionPending).toBe(true));

    // The authorizing fact arrives locally (e.g. via a sibling subscribe): the
    // watch's inverse listeners deliver a row, and pending resolves into data.
    await act(async () => {
      await j.fact(new Item(root, new Date(1000)));
    });

    await waitFor(() => expect(result.current.data?.length).toBe(1));
    expect(result.current.distributionPending).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
