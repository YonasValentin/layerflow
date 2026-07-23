/** A typed presentation contract. */
export interface PresentationContract<Input = unknown, Result = unknown> {
  readonly input: Input;
  readonly result: Result;
}

/** Extracts the input type for a presentation key. */
export type InputOf<Map, Key extends keyof Map> =
  Map[Key] extends PresentationContract<infer Input> ? Input : never;

/** Extracts the result type for a presentation key. */
export type ResultOf<Map, Key extends keyof Map> =
  Map[Key] extends PresentationContract<unknown, infer Result> ? Result : never;

export type PresentationStrategy =
  'enqueue' | 'replace' | 'interrupt' | 'stack' | 'drop' | 'coalesce';

export type PresentationPhase = 'queued' | 'mounting' | 'presenting' | 'presented' | 'dismissing';

type CustomReason = string & { readonly __layerflowCustomReason?: never };

export type DismissReason =
  | 'user'
  | 'programmatic'
  | 'replaced'
  | 'interrupted'
  | 'hardware-back'
  | 'scope-disposed'
  | 'timeout'
  | 'abort-signal'
  | 'host-unmounted'
  | CustomReason;

export type CancelReason =
  | 'interrupted'
  | 'scope-disposed'
  | 'abort-signal'
  | 'manager-disposed'
  | 'host-unmounted'
  | CustomReason;

export type PresentationOutcome<Result> =
  | { readonly status: 'resolved'; readonly value: Result }
  | { readonly status: 'dismissed'; readonly reason: DismissReason }
  | { readonly status: 'cancelled'; readonly reason: CancelReason }
  | { readonly status: 'dropped'; readonly reason: 'lane-busy' | 'duplicate' }
  | { readonly status: 'failed'; readonly error: unknown };

export interface PresentationOptions {
  readonly lane?: string;
  readonly strategy?: PresentationStrategy;
  readonly priority?: number;
  readonly dedupeKey?: string;
  readonly scope?: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly coalesceInput?: (current: unknown, incoming: unknown) => unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LaneConfig {
  readonly maxActive: number;
  readonly defaultStrategy: PresentationStrategy;
  readonly priority: 'fifo' | 'priority';
}

export interface ManagerOptions {
  readonly lanes?: Readonly<Record<string, Partial<LaneConfig>>>;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly onEvent?: (event: PresentationEvent) => void;
}

export interface PresentationRequestSnapshot {
  readonly id: string;
  readonly key: string;
  readonly input: unknown;
  readonly lane: string;
  readonly phase: PresentationPhase;
  readonly strategy: PresentationStrategy;
  readonly priority: number;
  readonly sequence: number;
  readonly revision: number;
  readonly createdAt: number;
  readonly dedupeKey?: string;
  readonly scope?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface LaneSnapshot {
  readonly name: string;
  readonly config: LaneConfig;
  readonly active: readonly PresentationRequestSnapshot[];
  readonly queue: readonly PresentationRequestSnapshot[];
}

export interface PresentationSnapshot {
  readonly version: number;
  readonly lanes: Readonly<Record<string, LaneSnapshot>>;
}

export type PresentationLifecycleEvent =
  | { readonly type: 'mounted' }
  | { readonly type: 'presented' }
  | { readonly type: 'dismissed'; readonly reason?: DismissReason }
  | { readonly type: 'failed'; readonly error: unknown };

export type PresentationEvent =
  | { readonly type: 'request.created'; readonly request: PresentationRequestSnapshot }
  | { readonly type: 'request.queued'; readonly request: PresentationRequestSnapshot }
  | { readonly type: 'request.activated'; readonly request: PresentationRequestSnapshot }
  | { readonly type: 'request.updated'; readonly request: PresentationRequestSnapshot }
  | {
      readonly type: 'request.lifecycle';
      readonly request: PresentationRequestSnapshot;
      readonly lifecycle: PresentationLifecycleEvent;
    }
  | {
      readonly type: 'request.settled';
      readonly request: PresentationRequestSnapshot;
      readonly outcome: PresentationOutcome<unknown>;
    };

export interface PresentationHandle<Result, Input = unknown> {
  readonly id: string;
  readonly result: Promise<PresentationOutcome<Result>>;
  dismiss(reason?: DismissReason): void;
  cancel(reason?: CancelReason): void;
  updateInput(updater: (current: Input) => Input): void;
}

export interface PresentationManager<Map extends object> {
  readonly getSnapshot: () => PresentationSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly subscribeEvents: (listener: (event: PresentationEvent) => void) => () => void;
  configureLane(name: string, config: Partial<LaneConfig>): void;
  enqueue<Key extends keyof Map & string>(
    key: Key,
    input: InputOf<Map, Key>,
    options?: PresentationOptions,
  ): PresentationHandle<ResultOf<Map, Key>, InputOf<Map, Key>>;
  present<Key extends keyof Map & string>(
    key: Key,
    input: InputOf<Map, Key>,
    options?: PresentationOptions,
  ): Promise<PresentationOutcome<ResultOf<Map, Key>>>;
  resolve(id: string, value: unknown): void;
  updateInput<Input>(id: string, updater: (current: Input) => Input): void;
  dismiss(id: string, reason?: DismissReason): void;
  cancel(id: string, reason?: CancelReason): void;
  notify(id: string, event: PresentationLifecycleEvent): void;
  cancelScope(scope: string): void;
  dismissTop(lanes?: readonly string[], reason?: DismissReason): boolean;
  dispose(): void;
}
