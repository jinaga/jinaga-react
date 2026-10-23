import {
  AuthenticationNoOp,
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

// A Network double that stands in for a replicator. It reports configured feed
// hashes and per-feed distribution decisions, as POST /feeds does. It can also
// refuse connections (`failing`) or hold every request until released (`hold`).
// JinagaTest's in-process network can do neither.
export class ControllableNetwork implements Network {
  public response: FeedsResponse = { feeds: ["f"], decisions: [{ feed: "f", decision: "authorized", reason: "" }] };
  public failing = false;
  private gate: Promise<void> | null = null;

  hold(): () => void {
    let release!: () => void;
    this.gate = new Promise<void>(resolve => { release = resolve; });
    return () => { this.gate = null; release(); };
  }

  private async respond<T>(value: () => T): Promise<T> {
    if (this.gate) await this.gate;
    if (this.failing) throw new Error("connect ECONNREFUSED");
    return value();
  }

  feeds(_start: FactReference[], _specification: Specification): Promise<FeedsResponse> {
    return this.respond(() => this.response);
  }

  fetchFeed(_feed: string, bookmark: string): Promise<FeedResponse> {
    return this.respond(() => ({ references: [], bookmark }));
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

export function makeJinaga(network: Network): Jinaga {
  const store = new MemoryStore();
  const factManager = new FactManager(new PassThroughFork(store), new ObservableSource(store), store, network, []);
  return new Jinaga(new AuthenticationNoOp(), factManager, null);
}
