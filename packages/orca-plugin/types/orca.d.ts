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
  export function Tabs(props: { key?: string | number; children?: any; label: string; value?: string; defaultValue?: string; onChange?: (value: string) => void }): any
  export function Tab(props: { key?: string | number; children?: any; value: string; label: string; icon?: IconName; disabled?: boolean }): any
  export function Grid(props: { key?: string | number; children?: any; columns?: 1 | 2 | 3 | 4 | 5 | 6; minItemWidth?: 'xs' | 'sm' | 'md' | 'lg'; gap?: Gap }): any
  export function Table(props: { key?: string | number; children?: any; label: string; columns: readonly any[]; rows: readonly any[]; sort?: any; selectionMode?: 'none' | 'single' | 'multiple'; selected?: readonly string[]; defaultSelected?: readonly string[]; hasMore?: boolean; loading?: boolean; emptyText?: string; maxHeight?: any; onSortChange?: (sort: any) => void; onSelectionChange?: (selection: { keys: string[] }) => void; onRowAction?: (row: { key: string }) => void; onLoadMore?: () => void }): any
  export function CodeView(props: { key?: string | number; children?: any; code: string; language?: string; label?: string; lineNumbers?: boolean; wrap?: boolean; maxHeight?: any }): any
  export function Markdown(props: { key?: string | number; children?: any; content: string }): any
  export function Input(props: { key?: string | number; children?: any; label: string; labelHidden?: boolean; value?: string; defaultValue?: string; placeholder?: string; type?: 'text' | 'search' | 'password'; maxLength?: number; invalid?: boolean; disabled?: boolean; onChange?: (value: string) => void; onSubmit?: (value: string) => void }): any
  export function Textarea(props: { key?: string | number; children?: any; label: string; labelHidden?: boolean; value?: string; defaultValue?: string; placeholder?: string; rows?: number; maxLength?: number; invalid?: boolean; disabled?: boolean; onChange?: (value: string) => void; onSubmit?: (value: string) => void }): any
  export function Select(props: { key?: string | number; children?: any; label: string; labelHidden?: boolean; value?: string; defaultValue?: string; placeholder?: string; options: readonly { value: string; label: string; disabled?: boolean }[]; disabled?: boolean; onChange?: (value: string) => void }): any
  export function Switch(props: { key?: string | number; children?: any; label: string; checked?: boolean; defaultChecked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void }): any
  export function Checkbox(props: { key?: string | number; children?: any; label: string; description?: string; checked?: boolean; defaultChecked?: boolean; disabled?: boolean; onChange?: (checked: boolean) => void }): any
  export function IconButton(props: { key?: string | number; children?: any; icon: IconName; label: string; tooltip?: string; variant?: Variant; tone?: Tone; size?: Size; disabled?: boolean; onPress?: Press }): any
  export function KeyValue(props: { key?: string | number; children?: any; label?: string; items: readonly any[] }): any
  export function Collapsible(props: { key?: string | number; children?: any; title: string; description?: string; open?: boolean; defaultOpen?: boolean; disabled?: boolean; onChange?: (open: boolean) => void }): any
  export function Link(props: { key?: string | number; children?: any; href?: string; onPress?: Press }): any
  export function Progress(props: { key?: string | number; children?: any; label: string; labelHidden?: boolean; value: number }): any
  export function RadioGroup(props: { key?: string | number; children?: any; label: string; labelHidden?: boolean; value?: string; defaultValue?: string; options: readonly any[]; orientation?: 'vertical' | 'horizontal'; disabled?: boolean; onChange?: (value: string) => void }): any
  export function Slider(props: { key?: string | number; children?: any; label: string; labelHidden?: boolean; value?: number; defaultValue?: number; min?: number; max?: number; step?: number; showValue?: boolean; disabled?: boolean; onChange?: (value: number) => void }): any
  export function Field(props: { key?: string | number; children?: any; label: string; description?: string; error?: string; required?: boolean }): any
  export function Toolbar(props: { key?: string | number; children?: any; label: string; gap?: Gap }): any
  export function Skeleton(props: { key?: string | number; children?: any; shape?: 'text' | 'block' | 'circle'; lines?: number; label?: string }): any
  export function RelativeTime(props: { key?: string | number; children?: any; at: number; format?: string; tone?: Tone; muted?: boolean }): any
  export function Image(props: { key?: string | number; children?: any; src: string; alt: string; size?: 'xs' | 'sm' | 'md' | 'lg' | 'full'; fit?: 'contain' | 'cover'; rounded?: boolean }): any
  export function Box(props: { key?: string | number; children?: any; direction?: 'row' | 'column'; gap?: Gap; padding?: Gap; paddingX?: Gap; paddingY?: Gap; margin?: Gap; align?: Align; justify?: 'start' | 'center' | 'end' | 'between'; wrap?: boolean; grow?: boolean; shrink?: boolean; width?: any; height?: any; minWidth?: any; minHeight?: any; maxWidth?: any; maxHeight?: any; columns?: 1 | 2 | 3 | 4 | 5 | 6; scroll?: 'x' | 'y' | 'both'; border?: boolean | Tone; radius?: 'none' | 'sm' | 'md' | 'lg' | 'full'; background?: 'none' | 'muted' | 'card' | Tone }): any
  export function Code(props: { key?: string | number; children?: any; block?: boolean }): any
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
