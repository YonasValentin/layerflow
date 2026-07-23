import type { ComponentType, ReactNode } from 'react';
import type {
  CancelReason,
  DismissReason,
  InputOf,
  ManagerOptions,
  PresentationContract,
  PresentationHandle,
  PresentationManager,
  PresentationOptions,
  PresentationOutcome,
  PresentationRequestSnapshot,
  PresentationStrategy,
  ResultOf,
} from '@layerflow/core';

export interface PresentationContentProps<Input, Result> {
  readonly input: Input;
  readonly requestId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly resolve: (value: Result) => void;
  readonly dismiss: (reason?: DismissReason) => void;
  readonly cancel: (reason?: CancelReason) => void;
}

export interface PresentationDefinition<Input, Result, AdapterOptions = unknown> {
  readonly surface: string;
  readonly component: ComponentType<PresentationContentProps<Input, Result>>;
  readonly lane?: string;
  readonly strategy?: PresentationStrategy;
  readonly priority?: number;
  readonly timeoutMs?: number;
  readonly dedupeKey?: string | ((input: Input) => string);
  readonly adapterOptions?: AdapterOptions;
  readonly coalesceInput?: (current: Input, incoming: Input) => Input;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

declare const presentationMapBrand: unique symbol;

export type PresentationSurfaces = Readonly<Record<string, unknown>>;

type DefinitionForSurfaces<Input, Result, Surfaces extends object> = {
  readonly [Surface in keyof Surfaces & string]: PresentationDefinition<
    Input,
    Result,
    Surfaces[Surface]
  > & { readonly surface: Surface };
}[keyof Surfaces & string];

export type PresentationRegistry<
  Map extends object,
  Surfaces extends object = PresentationSurfaces,
> = {
  readonly [Key in keyof Map]: Map[Key] extends PresentationContract<infer Input, infer Result>
    ? DefinitionForSurfaces<Input, Result, Surfaces>
    : never;
} & { readonly [presentationMapBrand]?: Map };

export interface PresentationController<Result = unknown> {
  readonly requestId: string;
  readonly mounted: () => void;
  readonly presented: () => void;
  readonly resolve: (value: Result) => void;
  readonly dismiss: (reason?: DismissReason) => void;
  readonly dismissed: (reason?: DismissReason) => void;
  readonly cancel: (reason?: CancelReason) => void;
  readonly failed: (error: unknown) => void;
}

export interface PresentationAdapterProps {
  readonly request: PresentationRequestSnapshot;
  readonly definition: PresentationDefinition<unknown, unknown>;
  readonly controller: PresentationController;
  readonly index: number;
  readonly children: ReactNode;
}

export type AnyPresentationDefinition = PresentationDefinition<unknown, unknown>;

export type PresentationAdapterComponent = ComponentType<PresentationAdapterProps>;
export type PresentationAdapters = Readonly<Record<string, PresentationAdapterComponent>>;

export interface PresentationSystem<Map extends object> {
  readonly manager: PresentationManager<Map>;
  readonly registry: PresentationRegistry<Map>;
  readonly enqueue: <Key extends keyof Map & string>(
    key: Key,
    input: InputOf<Map, Key>,
    options?: PresentationOptions,
  ) => PresentationHandle<ResultOf<Map, Key>, InputOf<Map, Key>>;
  readonly present: <Key extends keyof Map & string>(
    key: Key,
    input: InputOf<Map, Key>,
    options?: PresentationOptions,
  ) => Promise<PresentationOutcome<ResultOf<Map, Key>>>;
  readonly dismiss: (id: string, reason?: DismissReason) => void;
  readonly cancel: (id: string, reason?: CancelReason) => void;
  readonly cancelScope: (scope: string) => void;
}

export type CreatePresentationSystemOptions = ManagerOptions;
