declare module 'orca/testing' {
  export interface MockHostOptions {
    capabilities?: readonly string[]
    results?: Record<string, unknown>
    requests?: Record<string, unknown>
    storage?: Record<string, unknown>
    settings?: Record<string, unknown>
    secrets?: Record<string, string>
  }
  export interface MockHost {
    calls: readonly { method: string; params: unknown }[]
    refusals: readonly unknown[]
    callsOf(method: string): readonly { method: string; params: unknown }[]
    respond(method: string, result: unknown): void
    data(): { storage: Record<string, unknown>; settings: Record<string, unknown>; secrets: Record<string, string> }
  }
  export interface TestPanel {
    host: MockHost
    errors: readonly unknown[]
    warnings: readonly string[]
    refusals: readonly unknown[]
    find(query: { role?: string; text?: string }): { text?: string } | null
    findAll(query: { role?: string; text?: string }): Array<{ text?: string }>
    tree(): unknown
    summary(): string[]
    press(target: { text?: string; role?: string }): Promise<void>
    type(target: { text?: string; role?: string }, value: string, options?: { replace?: boolean; submit?: boolean }): Promise<void>
    post(event: string, payload?: unknown): Promise<void>
    emit(event: string, payload?: unknown): Promise<void>
    settled(): Promise<void>
    rerender(): Promise<void>
    unmount(): Promise<void>
  }
  export interface TestWorker {
    host: MockHost
    logs: readonly string[]
    refusals: readonly unknown[]
    posts: readonly { event: string; payload?: unknown; panel?: string }[]
    request(name: string, input?: unknown, caller?: { panel?: string }): Promise<any>
    emit(event: string, payload?: unknown): Promise<void>
    command(commandId: string, args?: unknown): Promise<unknown>
    deactivate(): Promise<void>
  }
  export function mockHost(options?: MockHostOptions): MockHost
  export function hostError(code: string, message?: string, retryAfterMs?: number): Error
  export function mount(target: unknown, options?: Record<string, unknown>): Promise<TestPanel>
  export function mountWorker(module: unknown, options?: Record<string, unknown>): Promise<TestWorker>
  export function defineCheck<S extends Record<string, MockHostOptions>>(scenarios: S): S
  export function stored(value: unknown, version: number): unknown
  export function test(name: string, fn: () => unknown): Promise<void>
  export function describe(name: string, fn: () => unknown): Promise<void>
  export function beforeEach(fn: () => unknown): void
  export function afterEach(fn: () => unknown): void
  export const assert: any
}
