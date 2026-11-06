declare module 'orca/worker' {
  export interface OrcaWorkerApi {
    storage: {
      get(key: string): Promise<unknown>
      set(key: string, value: unknown): Promise<void>
      delete(key: string): Promise<void>
      keys(): Promise<string[]>
    }
    settings: {
      get(key: string): Promise<unknown>
      set(key: string, value: unknown): Promise<void>
    }
    panels: {
      handle(name: string, handler: (input: any, ctx: { panel: { id: string }; signal: AbortSignal }) => Promise<unknown> | unknown): void
      post(event: string, payload: unknown, opts?: { panel?: string }): void
    }
    events: { on(event: string, handler: (payload: any) => void): { dispose(): void } }
    hooks: { on(event: string, handler: (event: any, next: (event: any) => any) => any): { dispose(): void } }
    commands: { register(commandId: string, handler: (args: unknown, context: any) => unknown): void }
    host: { call(method: string, params?: unknown): Promise<any> }
  }
}
