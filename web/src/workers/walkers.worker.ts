// The walker prior runs here, off the page's main thread (spec 10.6: a Web Worker).
/// <reference lib="webworker" />
import { runWalkerJob, type WalkerJob, type WalkerMessage } from "./walkerJob";

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (e: MessageEvent<WalkerJob>) => runWalkerJob(e.data, (m: WalkerMessage) => scope.postMessage(m));
