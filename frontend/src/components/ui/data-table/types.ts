import type { ColumnDef } from '@tanstack/react-table';
import type { MultiSelectOption } from '@/components/ui/multi-select';

export interface DataTableColumnMeta {
  /** Display name for column visibility menu */
  displayName?: string;
  /** Filter options — shows filter icon in header when provided */
  filterOptions?: MultiSelectOption[];
  /** Hidden by default (can be toggled on) */
  defaultHidden?: boolean;
  /** Cell alignment */
  align?: 'left' | 'center' | 'right';
  /** If false, column cannot be hidden via visibility toggle */
  canHide?: boolean;
  /** Initial width in pixels */
  width?: number;
  /** Minimum width for resize */
  minWidth?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<TData> = ColumnDef<TData, any> & {
  meta?: DataTableColumnMeta;
};
