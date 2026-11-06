// 本机 Orca 1.4.250 安装缺少 app.asar.unpacked/.../plugins/declarative/orca.d.ts，
// `orca plugin types` 无法生成 .orca/types。这里放最小自用声明，等上游修复后换回官方 typings。
declare module 'orca' {
  export type Gap = 'none' | 'xs' | 'sm' | 'md' | 'lg'
  export type Align = 'start' | 'center' | 'end' | 'stretch'
  export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  export type Size = 'xs' | 'sm' | 'md'
  export type Variant = 'solid' | 'outline' | 'ghost'
  export type IconName = string

  export interface Atom<T> {
    (): T
  }
  export interface AtomOptions<T> {
    persist?: 'memory' | 'plugin' | 'workspace' | 'storage'
    version?: number
    migrate?: (stored: unknown, fromVersion: number) => T
  }
  export function atom<T>(initial: T): Atom<T>
  export function atom<T>(key: string, initial: T, options?: AtomOptions<T>): Atom<T>
  export function read<T>(atom: Atom<T>): T
  export function set<T>(atom: Atom<T>, value: T): void
  export function update<T>(atom: Atom<T>, updater: (previous: T) => T): void

  export interface Disposable { dispose(): void }
  export interface PanelContext {
    subscriptions: Disposable[]
    signal: AbortSignal
    visible: Atom<boolean>
    panel: { id: string }
  }
  export interface PluginRequestOptions { signal?: AbortSignal; timeoutMs?: number }
  export interface PluginBridgeApi {
    request<K extends string>(name: K, input?: unknown, options?: PluginRequestOptions): Promise<any>
    on<K extends string>(event: K, handler: (payload: any) => void): Disposable
  }
  export const plugin: PluginBridgeApi
  export function on<E extends string>(event: E, handler: (payload: any) => void): Disposable

  export function Stack(props: { key?: string | number; children?: any; gap?: Gap; align?: Align }): any
  export function Row(props: { key?: string | number; children?: any; gap?: Gap; align?: Align; justify?: 'start' | 'center' | 'end' | 'between'; wrap?: boolean }): any
  export function Text(props: { key?: string | number; children?: any; tone?: Tone; muted?: boolean; size?: Size; weight?: 'regular' | 'medium' | 'semibold'; truncate?: boolean }): any
  export function Heading(props: { key?: string | number; children?: any; level?: 1 | 2 | 3 }): any
  export function Button(props: { key?: string | number; children?: any; variant?: Variant; tone?: Tone; size?: Size; icon?: IconName; tooltip?: string; disabled?: boolean; onPress?: () => unknown }): any
  export function Badge(props: { key?: string | number; children?: any; tone?: Tone }): any
  export function Card(props: { key?: string | number; children?: any; title?: string; description?: string }): any
  export function List(props: { key?: string | number; children?: any; label?: string }): any
  export function ListItem(props: { key?: string | number; children?: any; title?: string; description?: string; icon?: IconName; current?: boolean; disabled?: boolean; onPress?: () => unknown }): any
  export function EmptyState(props: { key?: string | number; children?: any; title: string; description?: string; icon?: IconName }): any
  export function Separator(props: { key?: string | number; orientation?: 'horizontal' | 'vertical' }): any
  export function Spinner(props: { key?: string | number; label: string; labelHidden?: boolean }): any
  export function Callout(props: { key?: string | number; children?: any; tone?: Tone; title?: string; icon?: IconName }): any
}

declare global {
  namespace JSX {
    interface Element {}
    interface ElementChildrenAttribute { children: {} }
    interface IntrinsicAttributes { key?: string | number }
    interface IntrinsicElements { [name: string]: any }
  }
}
